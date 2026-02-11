import sys
import os
import time
import json
import threading
import socket
import psutil
import requests
import ctypes
import re
import tkinter as tk
from tkinter import ttk, messagebox
from supabase import create_client, Client
from datetime import datetime
from flask import Flask, jsonify
from flask_cors import CORS

# Import PyGetWindow and others conditionally
try:
    import pygetwindow as gw
except ImportError:
    gw = None
try:
    import GPUtil
except ImportError:
    GPUtil = None
try:
    import wmi
except ImportError:
    wmi = None
try:
    import platform
except ImportError:
    platform = None

# === Configuration ===
SUPABASE_URL = 'https://degptapfdldfvqzzdzcm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZ3B0YXBmZGxkZnZxenpkemNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzODQxODcsImV4cCI6MjA2OTk2MDE4N30.4WuPEggkHpLZT9ZSYvKHImQtcSzfUDpddGsB3M__HG0'

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
LOG_FILE = "data.json"

# === Flask App Setup (For Frontend Communication) ===
app = Flask(__name__)
CORS(app)
agent_instance = None # Global reference for Flask routes

@app.route('/api/test', methods=['GET'])
def test_api():
    return jsonify({'status': 'ok', 'message': 'Agent is running'})

@app.route('/api/get-ip', methods=['GET'])
def get_ip_api():
    # Return the IP that Smart Registration used
    if agent_instance:
        return jsonify({'ip_address': agent_instance.ip})
    return jsonify({'ip_address': '127.0.0.1'})

@app.route('/api/resource-usage', methods=['GET'])
def get_resource_usage_api():
    if agent_instance:
        data = agent_instance.get_resource_usage()
        return jsonify(data)
    return jsonify({})

# === Identity Helper Class ===
class MachineIdentity:
    @staticmethod
    def get_identities():
        """Returns (ip_address, list_of_macs)"""
        ip_address = MachineIdentity.get_local_ip()
        macs = []
        try:
            for interface, addrs in psutil.net_if_addrs().items():
                for addr in addrs:
                    if addr.family == psutil.AF_LINK:
                        mac = addr.address.upper().replace("-", ":")
                        if mac and mac != "00:00:00:00:00:00":
                            macs.append(mac)
        except Exception as e:
            print(f"[Error] Failed to get MACs: {e}")
        
        return ip_address, list(set(macs))

    @staticmethod
    def get_local_ip():
        try:
            # Use socket to determine real outbound IP
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return "127.0.0.1"


# === Core Agent Class ===
class ProctorAgent:
    def __init__(self):
        self.root = None
        self.is_monitoring = False
        self.stop_event = threading.Event()
        
        # State
        self.current_room_name = None
        self.current_seat = None
        self.current_layout_id = None
        self.current_room_id = None
        self.current_session_id = None
        self.current_blocked_resources = []
        self.last_alert_time = 0
        
        # Identity
        self.ip, self.macs = MachineIdentity.get_identities()
        print(f"[Identity] IP: {self.ip}")
        print(f"[Identity] MACs: {self.macs}")
        
        # Register global instance for Flask
        global agent_instance
        agent_instance = self
        
        # Start Flask Server
        self.start_api_server()

    def start_api_server(self):
        def run_server():
            try:
                # Disable reloader/debug to work in thread
                app.run(host='0.0.0.0', port=5001, debug=False, use_reloader=False)
            except Exception as e:
                print(f"[API Server Error] {e}")

        api_thread = threading.Thread(target=run_server)
        api_thread.daemon = True
        api_thread.start()
        print("[System] Local API Server started on port 5001")

    def auto_setup_dependencies(self):
        """
        Auto-check and install required libraries (from backup)
        """
        import importlib.util
        import subprocess
        
        # Check Python Version (Warn if not 3.11)
        current_ver = sys.version_info
        print(f"[Setup] Checking Python version... Current: {sys.version.split()[0]}")
        if not (current_ver.major == 3 and current_ver.minor == 11):
            print(f"[Warning] This application is designed for Python 3.11. You are running {sys.version.split()[0]}.")

        # Check & Install Required Libraries
        requirements = {
            'psutil': 'psutil',
            'pygetwindow': 'PyGetWindow',
            'requests': 'requests',
            'supabase': 'supabase',
            'flask': 'flask',
            'flask_cors': 'flask-cors',
            'GPUtil': 'gputil',
            'wmi': 'wmi',
            'win32com': 'pywin32'
        }
        
        missing = []
        # print("[Setup] Checking required libraries...") # Reduce log noise
        for import_name, package_name in requirements.items():
            if importlib.util.find_spec(import_name) is None:
                missing.append(package_name)
        
        if missing:
            print(f"[Setup] Missing libraries found: {', '.join(missing)}")
            print("[Setup] Installing missing libraries...")
            try:
                subprocess.check_call([sys.executable, '-m', 'pip', 'install'] + missing)
                print("[Setup] Installation complete! Restarting...")
                os.execv(sys.executable, [sys.executable] + sys.argv)
            except subprocess.CalledProcessError as e:
                print(f"[Error] Failed to install libraries: {e}")

    def start(self):
        """Entry point"""
        self.auto_setup_dependencies() 
        print("[Agent] Checking Smart Registration...")
        try:
            # Call the Supabase RPC function for Smart Registration
            response = supabase.rpc('handle_smart_registration', {
                'p_macs': self.macs,
                'p_current_ip': self.ip
            }).execute()
            
            # Normal success path
            self.process_registration_response(response.data)
                
        except Exception as e:
            # Handle "False Positive" errors from Supabase Client (Code 200 but raises Exception)
            error_handled = False
            try:
                # Check if e has 'code' and 'details' (standard PostgrestError)
                # or if it's a dict-like string in the message
                err_dict = {}
                if hasattr(e, 'code'):
                    err_dict['code'] = e.code
                    err_dict['details'] = e.details
                elif hasattr(e, 'args') and len(e.args) > 0 and isinstance(e.args[0], dict):
                    err_dict = e.args[0]
                
                # If it's the specific "JSON could not be generated" error with Code 200
                if str(err_dict.get('code')) == '200':
                    details = err_dict.get('details')
                    # Details might be bytes or string
                    if isinstance(details, bytes):
                        details = details.decode('utf-8')
                    
                    if isinstance(details, str):
                        # Clean up if it looks like "b'{...}'" string representation
                        if details.startswith("b'") and details.endswith("'"):
                            details = details[2:-1]
                        
                        data = json.loads(details)
                        self.process_registration_response(data)
                        error_handled = True
            except Exception as parse_error:
                print(f"[Debug] Failed to recover from error: {parse_error}")

            if not error_handled:
                print(f"[Error] Connection failed: {e}")
                if self.root is None:
                    self.launch_error_gui(str(e))

    def process_registration_response(self, data):
        """Handle the logic after getting data from RPC (either direct or recovered from error)"""
        if not data:
            print("[Error] No data received")
            return

        status = data.get('status')
        print(f"[Server Response] Status: {status}")
        
        if status in ["SUCCESS", "RECOVERED"]:
            print(f"[Success] {data.get('message')}")
            self.current_room_name = data.get('room_name')
            self.current_seat = data.get('seat_number')
            self.fetch_room_details()
            self.start_monitoring_loop()
        else:
            print("[Info] Machine not found in history. Launching Registration GUI...")
            self.launch_gui() # Blocks until registered

    def fetch_room_details(self):
        try:
            # Layout ID
            res = supabase.table('room_seat_layouts').select('id').eq('room_name', self.current_room_name).execute()
            if res.data:
                self.current_layout_id = res.data[0]['id']
            # Room ID (exam_rooms)
            res2 = supabase.table('exam_rooms').select('id').eq('room_name', self.current_room_name).execute()
            if res2.data:
                self.current_room_id = res2.data[0]['id']
        except Exception as e:
            print(f"[Error] Fetch room details failed: {e}")

    # === GUI Section ===
    def launch_gui(self):
        self.root = tk.Tk()
        self.root.title("Exam Machine Registration")
        self.root.geometry("400x400")
        
        # Center window
        try:
             self.root.eval('tk::PlaceWindow . center')
        except: pass
        
        style = ttk.Style()
        style.configure("TLabel", font=("Segoe UI", 10))
        style.configure("TButton", font=("Segoe UI", 10, "bold"))

        ttk.Label(self.root, text="ลงทะเบียนเครื่องสอบ", font=("Segoe UI", 16, "bold")).pack(pady=20)

        # Room Selection
        ttk.Label(self.root, text="เลือกห้องสอบ:").pack(pady=5)
        self.room_var = tk.StringVar()
        self.room_combo = ttk.Combobox(self.root, textvariable=self.room_var, state="readonly", width=30)
        self.room_combo.pack(pady=5)
        
        try:
            # Fetch active rooms
            rooms = supabase.table('room_seat_layouts').select('id, room_name').execute() # Removed is_active check to match schema provided (no is_active column in layout)
            self.room_map = {r['room_name']: r['id'] for r in rooms.data}
            self.room_combo['values'] = list(self.room_map.keys())
        except Exception as e:
             self.room_combo['values'] = [f"Error loading rooms: {e}"]

        # Seat Input
        ttk.Label(self.root, text="เลขที่นั่ง (เช่น 1-1, 2-5):", font=("Segoe UI", 9, "italic")).pack(pady=5)
        self.seat_entry = ttk.Entry(self.root, width=30)
        self.seat_entry.pack(pady=5)

        self.status_lbl = ttk.Label(self.root, text="", foreground="red")
        self.status_lbl.pack(pady=10)

        submit_btn = ttk.Button(self.root, text="ลงทะเบียนเข้าใช้งาน", command=self.on_submit)
        submit_btn.pack(pady=20)
        
        self.root.protocol("WM_DELETE_WINDOW", lambda: sys.exit(0))
        self.root.mainloop()

    def launch_error_gui(self, error_msg):
        root = tk.Tk()
        root.title("Connection Error")
        root.geometry("400x200")
        ttk.Label(root, text="เกิดข้อผิดพลาดในการเชื่อมต่อ:", font=("bold")).pack(pady=10)
        txt = tk.Text(root, height=5, width=40)
        txt.insert(tk.END, error_msg)
        txt.pack()
        root.mainloop()

    def on_submit(self):
        room_name = self.room_var.get()
        seat_num = self.seat_entry.get().strip()

        if not room_name or not seat_num:
             self.status_lbl.config(text="กรุณากรอกข้อมูลให้ครบถ้วน")
             return

        if "-" not in seat_num and len(seat_num) < 3:
             self.status_lbl.config(text="รูปแบบเลขที่นั่งไม่ถูกต้อง (ตัวอย่าง: 1-1)")
             return

        try:
            layout_id = self.room_map[room_name]
            
            # Simple parsing of seat (row-col)
            parts = seat_num.split('-')
            if len(parts) >= 2:
                row = int(parts[0])
                col = int(parts[1])
            else:
                row = 0; col = 0
            
            data = {
                "layout_id": layout_id,
                "seat_number": seat_num,
                "row_number": row,
                "column_number": col,
                "ip_address": self.ip,
                "current_macs": self.macs
            }
            
            # Upsert into room_seat_ip_mappings
            supabase.table('room_seat_ip_mappings').upsert(data, on_conflict='layout_id, seat_number').execute()
            
            messagebox.showinfo("Success", f"ลงทะเบียนที่นั่ง {seat_num} เรียบร้อยแล้ว")
            self.current_room_name = room_name
            self.current_seat = seat_num
            self.current_layout_id = layout_id
            
            self.root.destroy()
            self.fetch_room_details() # Ensure room_id is set
            self.start_monitoring_loop()
            
        except Exception as e:
            self.status_lbl.config(text=f"Error: {str(e)}")
            print(e)

    # === Session & Logging ===
    def check_active_session(self):
        """Find active session for this seat"""
        if not self.current_room_id or not self.current_seat: return

        try:
            # Find session that is ongoing
            res = supabase.table('exam_student_sessions')\
                .select('id, student_email, student_name')\
                .eq('room_id', self.current_room_id)\
                .eq('seat_number', self.current_seat)\
                .eq('status', 'ongoing')\
                .order('created_at', desc=True)\
                .limit(1)\
                .execute()
            
            if res.data:
                sess = res.data[0]
                if self.current_session_id != sess['id']:
                    print(f"[Session] Found new session: {sess['student_name']} ({sess['id']})")
                    self.current_session_id = sess['id']
            else:
                if self.current_session_id:
                    print("[Session] Session ended or no active session.")
                    self.current_session_id = None
                    
        except Exception as e:
            print(f"[Session Check Error] {e}")

    def save_resource_log(self, resources):
        if not self.current_session_id: return
        
        try:
            log_data = {
                "session_id": self.current_session_id,
                "timestamp": resources["timestamp"],
                "active_window_title": resources.get("active_window_title", ""),
                "all_open_windows": resources.get("all_open_windows", []),
                "cpu_usage": int(resources.get("cpu_usage", 0)),
                "ram_usage": int(resources.get("ram_usage", 0)), 
                "cpu_model": resources.get("cpu_model", ""),
                "ram_total_gb": resources.get("ram_total_gb", 0),
                "ram_used_gb": resources.get("ram_used_gb", 0),
                "disk_partitions_info": resources.get("disk_partitions_info", []),
                "network_download_mb": resources.get("network_download_mb", 0),
                "network_upload_mb": resources.get("network_upload_mb", 0)
            }
            supabase.table('resource_logs').insert(log_data).execute()
        except Exception as e:
            pass

    def save_violation_log(self, violation_type, details):
        if not self.current_session_id: return
        try:
            data = {
                "session_id": self.current_session_id,
                "timestamp": datetime.now().isoformat(),
                "violation_type": violation_type,
                "resource_name": details,
                "action_taken": "Force Close / Alert",
                "details": details
            }
            supabase.table('violation_logs').insert(data).execute()
        except: pass

    # === Monitoring Logic ===
    def start_monitoring_loop(self):
        self.is_monitoring = True
        self.stop_event.clear()
        
        # Start background monitoring thread
        t = threading.Thread(target=self._run_monitoring)
        t.daemon = True
        t.start()
        
        print(f"--> Monitoring Active for Room: {self.current_room_name} | Seat: {self.current_seat}")
        print("--> Press Ctrl+C to exit agent.")
        
        # Keep main thread alive
        try:
            while self.is_monitoring:
                time.sleep(1)
        except KeyboardInterrupt:
            self.stop_event.set()
            print("Stopping...")

    def _run_monitoring(self):
        # Initial blocked resources fetch
        self.fetch_room_details() # Ensure we have IDs
        self.update_blocked_resources_list()

        while not self.stop_event.is_set():
            try:
                # 1. Heartbeat Check (Admin Reset)
                if not self.check_binding_valid():
                    print("[System] Seat Unbound/Reset by Admin. Restarting...")
                    self.restart_application()
                    break

                # 2. Check for Active Session (Polling)
                if int(time.time()) % 5 == 0: # Check every 5s
                    self.check_active_session()

                # 3. Get Resources
                resources = self.get_resource_usage()
                
                # 4. Check Violations
                self.check_for_violations(resources)

                # 5. Log to Supabase
                if self.current_session_id and int(time.time()) % 10 == 0:
                     self.save_resource_log(resources)
                
                # 6. Periodic Updates
                if int(time.time()) % 60 == 0:
                    self.update_blocked_resources_list()

                time.sleep(1) 
                
            except Exception as e:
                print(f"[Monitor Loop Error] {e}")
                time.sleep(5)

    def restart_application(self):
        self.is_monitoring = False
        self.stop_event.set()
        # Clean logic to restart script
        python = sys.executable
        os.execl(python, python, *sys.argv)

    def check_binding_valid(self):
        """Returns True if this machine is still assigned to the seat"""
        try:
            res = supabase.table('room_seat_ip_mappings')\
                .select('current_macs')\
                .eq('layout_id', self.current_layout_id)\
                .eq('seat_number', self.current_seat)\
                .execute()
            
            if not res.data: return False # Row deleted
            
            cloud_macs = res.data[0]['current_macs']
            # If current_macs is empty array/null, it means Unbound
            if not cloud_macs or len(cloud_macs) == 0: return False
            
            return True
        except:
            return True # Fail open on network error

    def update_blocked_resources_list(self):
        try:
            # Must link room_name -> exam_rooms.id -> room_blocked_resources
            if self.current_room_name:
                room_res = supabase.table('exam_rooms').select('id').eq('room_name', self.current_room_name).execute()
                if room_res.data:
                    rid = room_res.data[0]['id']
                    res = supabase.table('room_blocked_resources').select('*').eq('room_id', rid).execute()
                    self.current_blocked_resources = res.data
                    print(f"[Config] Updated blocked resources: {len(self.current_blocked_resources)} rules")
        except Exception as e:
            print(f"[Config Error] {e}")

    # === Resource Gathering Helpers ===
    def get_cpu_info(self):
        try:
            processor_name = platform.processor() if platform else "Unknown"
            cpu_cores = psutil.cpu_count()
            cpu_model = f"{processor_name} ({cpu_cores} cores)"
            cpu_usage = psutil.cpu_percent(interval=0.1)
            return {
                "processor_name": processor_name,
                "cpu_cores": cpu_cores,
                "cpu_model": cpu_model,
                "cpu_usage": cpu_usage
            }
        except: return {"cpu_usage": 0}

    def get_memory_info(self):
        try:
            m = psutil.virtual_memory()
            return {
                "ram_total_gb": round(m.total / (1024**3), 2),
                "ram_used_gb": round(m.used / (1024**3), 2),
                "ram_available_gb": round(m.available / (1024**3), 2),
                "ram_usage": m.percent
            }
        except: return {"ram_usage": 0}

    def get_disk_info(self):
        try:
            partitions = []
            for p in psutil.disk_partitions():
                try:
                    usage = psutil.disk_usage(p.mountpoint)
                    partitions.append({
                        "device": p.device,
                        "mountpoint": p.mountpoint,
                        "total_gb": round(usage.total / (1024**3), 2),
                        "used_gb": round(usage.used / (1024**3), 2),
                        "free_gb": round(usage.free / (1024**3), 2),
                        "percent": usage.percent
                    })
                except: pass
            return {"disk_partitions_info": partitions}
        except: return {}

    def get_network_info(self):
        try:
            net = psutil.net_io_counters()
            return {
                "network_download_mb": round(net.bytes_recv / (1024**2), 2),
                "network_upload_mb": round(net.bytes_sent / (1024**2), 2)
            }
        except: return {}

    # === Resource & Violation Detection ===
    def get_resource_usage(self):
        data = {}
        data.update(self.get_cpu_info())
        data.update(self.get_memory_info())
        data.update(self.get_disk_info())
        data.update(self.get_network_info())
        
        # Windows
        title = ""
        all_wins = []
        if gw:
            try:
                w = gw.getActiveWindow()
                if w: title = w.title
                all_wins = [w.title for w in gw.getAllWindows() if w.title]
            except: pass
            
        data["active_window_title"] = title
        data["all_open_windows"] = all_wins
        data["timestamp"] = datetime.now().isoformat()
        return data

    def check_for_violations(self, resources):
        if not self.current_blocked_resources: return
        
        active_title = resources.get("active_window_title", "").lower()
        all_titles = [t.lower() for t in resources.get("all_open_windows", [])]
        
        violations = []
        
        for rule in self.current_blocked_resources:
            pattern = rule['pattern'].lower()
            match_type = rule.get('match_type', 'contains')
            
            # Check Active Window
            is_hit = False
            if match_type == 'exact':
                 if pattern == active_title: is_hit = True
            else:
                 if pattern in active_title: is_hit = True
            
            if is_hit:
                violations.append(f"Active Window: {active_title}")
                self.force_close_window()

            # Check Background Windows? (Optional, aggressive)
            # for t in all_titles: ...
        
        if violations:
            print(f"[VIOLATION] {violations}")
            if time.time() - self.last_alert_time > 10:
                self.last_alert_time = time.time()
                self.show_alert("Violation Detected", f"ไม่อนุญาตให้เปิดโปรแกรม: {violations[0]}")
                self.save_violation_log("Blocked Application", violations[0])

    def force_close_window(self):
        if gw:
            try:
                w = gw.getActiveWindow()
                if w: w.close()
            except: pass

    def show_alert(self, title, msg):
        threading.Thread(target=lambda: ctypes.windll.user32.MessageBoxW(0, msg, title, 0x30 | 0x40000)).start()

if __name__ == "__main__":
    agent = ProctorAgent()
    agent.start()
