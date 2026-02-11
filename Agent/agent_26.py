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
from tkinter import ttk, messagebox, simpledialog
from supabase import create_client, Client
from datetime import datetime
from flask import Flask, jsonify
from flask_cors import CORS
import importlib.util
import subprocess

# === 1. Auto-Setup Environment (Restored from Backup) ===
def setup_environment():
    # Check Python Version
    current_ver = sys.version_info
    if not (current_ver.major == 3 and current_ver.minor == 11):
        print(f"[Info] Running on Python {sys.version.split()[0]}")

    # Required Libraries
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
    for import_name, package_name in requirements.items():
        if importlib.util.find_spec(import_name) is None:
            missing.append(package_name)
    
    if missing:
        print(f"[Setup] Missing libraries: {', '.join(missing)}. Installing...")
        try:
            subprocess.check_call([sys.executable, '-m', 'pip', 'install'] + missing)
            print("[Setup] Restarting application...")
            os.execv(sys.executable, [sys.executable] + sys.argv)
        except Exception as e:
            print(f"[Error] Install failed: {e}")

# Run setup first
setup_environment()

# Import conditionally
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

# === Flask App Setup ===
app = Flask(__name__)
CORS(app)
agent_instance = None 

@app.route('/api/test', methods=['GET'])
def test_api():
    return jsonify({'status': 'ok', 'message': 'Agent is running'})

@app.route('/api/get-ip', methods=['GET'])
def get_ip_api():
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
        
        global agent_instance
        agent_instance = self
        
        self.start_api_server()

    def start_api_server(self):
        def run_server():
            try:
                app.run(host='0.0.0.0', port=5001, debug=False, use_reloader=False)
            except Exception as e:
                print(f"[API Server Error] {e}")

        api_thread = threading.Thread(target=run_server)
        api_thread.daemon = True
        api_thread.start()
        print("[System] Local API Server started on port 5001")

    # --- Robust Manual Binding (Restored) ---
    def manual_binding_update(self):
        print("[System] Checking IP bindings via MAC...")
        try:
            # Check if any MAC exists in DB
            for mac in self.macs:
                try:
                    res = supabase.table('room_seat_ip_mappings').select('*').eq('mac_address', mac).execute()
                    # Also check inside known_macs JSONB if you implement that later
                    if res.data:
                        for row in res.data:
                            if row['ip_address'] != self.ip:
                                supabase.table('room_seat_ip_mappings').update({
                                    'ip_address': self.ip,
                                    'updated_at': datetime.now().isoformat()
                                }).eq('id', row['id']).execute()
                                print(f"[System] Auto-updated IP for MAC {mac}")
                except: pass
        except Exception as e:
            print(f"[System] Manual update error: {e}")

    def start(self):
        print(f"[Agent] Starting on IP: {self.ip}")
        self.manual_binding_update() # Try simple update first

        print("[Agent] Connecting to Smart Registration...")
        try:
            # Call the smart RPC function
            response = supabase.rpc('handle_smart_registration', {
                'p_macs': self.macs,
                'p_current_ip': self.ip
            }).execute()
            
            self.process_registration_response(response.data)
                
        except Exception as e:
            print(f"[Connection Error] {e}")
            # Try to handle the '200 OK' error quirk of Supabase Python
            try:
                if hasattr(e, 'details'): # Try to parse details if available
                     # Add your parsing logic here if needed or just fallback
                     pass
            except: pass
            
            # If RPC fails drastically, maybe we show error GUI or try fallback
            self.launch_error_gui(f"Connection Failed: {str(e)}")

    def process_registration_response(self, data):
        if not data:
            print("[Error] No data from server.")
            return

        status = data.get('status')
        print(f"[Server Response] {status}: {data.get('message')}")
        
        if status in ["SUCCESS", "RECOVERED"]:
            self.current_room_name = data.get('room_name')
            self.current_seat = data.get('seat_number')
            self.fetch_room_details()
            self.start_monitoring_loop()
        else:
            # NOT_FOUND -> Launch GUI
            self.launch_gui()

    def fetch_room_details(self):
        try:
            # Get Layout ID
            res = supabase.table('room_seat_layouts').select('id').eq('room_name', self.current_room_name).execute()
            if res.data:
                self.current_layout_id = res.data[0]['id']
            # Get Exam Room ID
            res2 = supabase.table('exam_rooms').select('id').eq('room_name', self.current_room_name).execute()
            if res2.data:
                self.current_room_id = res2.data[0]['id']
        except Exception as e:
            print(f"[Error] Fetch details: {e}")

    # === GUI Section (From Agent 26 - Kept Intact) ===
    def launch_gui(self):
        self.root = tk.Tk()
        self.root.title("Exam Registration")
        self.root.geometry("400x450")
        
        try: self.root.eval('tk::PlaceWindow . center')
        except: pass
        
        style = ttk.Style()
        style.configure("TLabel", font=("Segoe UI", 10))
        style.configure("TButton", font=("Segoe UI", 10, "bold"))

        ttk.Label(self.root, text="ลงทะเบียนเครื่องสอบ", font=("Segoe UI", 16, "bold")).pack(pady=20)

        # Room
        ttk.Label(self.root, text="เลือกห้องสอบ:").pack(pady=5)
        self.room_var = tk.StringVar()
        self.room_combo = ttk.Combobox(self.root, textvariable=self.room_var, state="readonly", width=30)
        self.room_combo.pack(pady=5)
        
        try:
            rooms = supabase.table('room_seat_layouts').select('id, room_name').execute()
            self.room_map = {r['room_name']: r['id'] for r in rooms.data}
            self.room_combo['values'] = list(self.room_map.keys())
        except Exception as e:
             self.room_combo['values'] = ["Error loading rooms"]

        # Seat
        ttk.Label(self.root, text="เลขที่นั่ง (เช่น 1-1):", font=("Segoe UI", 9)).pack(pady=5)
        self.seat_entry = ttk.Entry(self.root, width=30)
        self.seat_entry.pack(pady=5)

        self.status_lbl = ttk.Label(self.root, text="", foreground="red")
        self.status_lbl.pack(pady=10)

        ttk.Button(self.root, text="ลงทะเบียน", command=self.on_submit).pack(pady=20)
        
        self.root.protocol("WM_DELETE_WINDOW", lambda: sys.exit(0))
        self.root.mainloop()

    def launch_error_gui(self, error_msg):
        root = tk.Tk()
        root.title("Error")
        root.geometry("400x200")
        ttk.Label(root, text="Connection Error:", font=("bold")).pack(pady=10)
        txt = tk.Text(root, height=5, width=40)
        txt.insert(tk.END, error_msg)
        txt.pack()
        root.mainloop()

    def on_submit(self):
        room_name = self.room_var.get()
        seat_num = self.seat_entry.get().strip()

        if not room_name or not seat_num:
             self.status_lbl.config(text="กรุณากรอกข้อมูลให้ครบ")
             return

        try:
            layout_id = self.room_map[room_name]
            parts = seat_num.split('-')
            row = int(parts[0]) if len(parts) >= 1 and parts[0].isdigit() else 0
            col = int(parts[1]) if len(parts) >= 2 and parts[1].isdigit() else 0
            
            # Using JSONB for Macs logic if your DB supports it, else fallback
            data = {
                "layout_id": layout_id,
                "seat_number": seat_num,
                "row_number": row,
                "column_number": col,
                "ip_address": self.ip,
                # "current_macs": self.macs  <-- Add this if you added the column
                # "mac_address": self.macs[0] if self.macs else None <-- Fallback
            }
            # Try adding mac_address for standard schema
            if self.macs:
                data["mac_address"] = self.macs[0]
            
            # Upsert
            supabase.table('room_seat_ip_mappings').upsert(data, on_conflict='layout_id, seat_number').execute()
            
            messagebox.showinfo("Success", f"ลงทะเบียน {seat_num} สำเร็จ")
            self.current_room_name = room_name
            self.current_seat = seat_num
            self.current_layout_id = layout_id
            
            self.root.destroy()
            self.fetch_room_details()
            self.start_monitoring_loop()
            
        except Exception as e:
            self.status_lbl.config(text=f"Error: {str(e)}")

    # === Monitoring & Logic (Restored Robustness) ===
    def check_active_session(self):
        if not self.current_layout_id or not self.current_seat: return

        try:
            # Poll for session
            res = supabase.table('exam_student_sessions')\
                .select('id, student_email, student_name')\
                .eq('layout_id', self.current_layout_id)\
                .eq('seat_number', str(self.current_seat))\
                .eq('is_active', True)\
                .order('created_at', desc=True)\
                .limit(1)\
                .execute()
            
            if res.data:
                sess = res.data[0]
                if self.current_session_id != sess['id']:
                    print(f"[Session] Started: {sess['student_name']}")
                    self.current_session_id = sess['id']
            else:
                if self.current_session_id:
                    print("[Session] Ended.")
                    self.current_session_id = None
        except: pass

    # --- Restored: Local Backup ---
    def save_to_local_backup(self, data):
        try:
            logs = []
            if os.path.exists(LOG_FILE):
                try:
                    with open(LOG_FILE, "r") as f:
                        logs = json.load(f)
                except: pass
            logs.append(data)
            with open(LOG_FILE, "w") as f:
                json.dump(logs, f, indent=4)
            print("[System] Saved to local backup (Offline)")
        except Exception as e:
            print(f"[Error] Local backup failed: {e}")

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
                "network_download_mb": resources.get("network_download_mb", 0),
                "exe_processes": resources.get("exe_processes", [])
            }
            res = supabase.table('resource_logs').insert(log_data).execute()
            print(f"[Log] Uploaded. CPU: {log_data['cpu_usage']}%")
        except Exception as e:
            print(f"[Log Error] Upload failed: {e}")
            self.save_to_local_backup(log_data) # Fallback

    def save_violation_log(self, violation_type, details, action_taken):
        if not self.current_session_id: return
        try:
            threading.Thread(target=supabase.table('violation_logs').insert({
                "session_id": self.current_session_id,
                "timestamp": datetime.now().isoformat(),
                "violation_type": violation_type,
                "resource_name": details,
                "action_taken": action_taken,
                "details": details
            }).execute).start()
        except: pass

    # --- Restored: Robust Violation Checking (Smart URL) ---
    def check_for_violations(self, resources):
        if not self.current_blocked_resources: return
        
        active_win = resources.get("active_window_title", "")
        all_wins = resources.get("all_open_windows", [])
        processes = resources.get("exe_processes", [])
        
        violations = []

        for rule in self.current_blocked_resources:
            pattern = rule.get('pattern', '').lower()
            match_type = rule.get('match_type', 'contains')

            # --- Smart Matching Helper (From Backup) ---
            def is_match(text):
                text = text.lower()
                if match_type == 'exact': return pattern == text
                if pattern in text: return True
                # Smart URL
                if match_type == 'contains' and ('.' in pattern or 'http' in pattern):
                    clean = pattern.replace("https://", "").replace("http://", "").replace("www.", "")
                    if '/' in clean: clean = clean.split('/')[0]
                    parts = clean.split('.')
                    sig_parts = [p for p in parts if len(p) >= 3 and p not in ['com', 'org', 'net']]
                    if sig_parts and sig_parts[0] in text: return True
                return False
            # -------------------------------------------

            # 1. Active Window
            if active_win and is_match(active_win):
                print(f"[Violation] Active Window: {active_win}")
                self.force_close_window(active_win)
                violations.append(f"Window: {active_win}")
                self.save_violation_log("ACTIVE_WINDOW", active_win, "Force Closed")

            # 2. Processes (More aggressive)
            for proc in processes:
                if is_match(proc['name']):
                    print(f"[Violation] Process: {proc['name']}")
                    try:
                        psutil.Process(proc['pid']).terminate()
                        violations.append(f"Process: {proc['name']}")
                        self.save_violation_log("PROCESS", proc['name'], "Terminated")
                    except: pass

        if violations and (time.time() - self.last_alert_time > 10):
            self.last_alert_time = time.time()
            msg = "ตรวจพบโปรแกรมต้องห้าม:\n" + "\n".join(violations) + "\n\nระบบได้ทำการปิดโปรแกรมอัตโนมัติ"
            threading.Thread(target=self.show_alert, args=("Violation Detected", msg)).start()

    def force_close_window(self, title):
        if gw:
            try:
                for w in gw.getWindowsWithTitle(title):
                    w.close()
            except: pass

    def show_alert(self, title, msg):
        ctypes.windll.user32.MessageBoxW(0, msg, title, 0x30 | 0x40000)

    # --- Main Loop ---
    def start_monitoring_loop(self):
        self.is_monitoring = True
        self.stop_event.clear()
        
        t = threading.Thread(target=self._run_monitoring)
        t.daemon = True
        t.start()
        
        print(f"--> Monitoring Active for {self.current_room_name} - {self.current_seat}")
        
        try:
            while self.is_monitoring:
                time.sleep(1)
        except KeyboardInterrupt:
            self.stop_event.set()

    def _run_monitoring(self):
        self.update_blocked_resources_list()
        
        while not self.stop_event.is_set():
            try:
                # 1. Admin Reset Check
                if not self.check_binding_valid():
                    print("[System] Seat unbound. Restarting...")
                    self.restart_application()
                    break

                # 2. Session Check
                if int(time.time()) % 5 == 0:
                    self.check_active_session()

                # 3. Resources & Violations
                resources = self.get_resource_usage()
                self.check_for_violations(resources)

                # 4. Logging
                if self.current_session_id and int(time.time()) % 10 == 0:
                     self.save_resource_log(resources)
                
                # 5. Config Update
                if int(time.time()) % 60 == 0:
                    self.update_blocked_resources_list()

                time.sleep(1)
            except Exception as e:
                print(f"[Loop Error] {e}")
                time.sleep(5)

    def restart_application(self):
        self.is_monitoring = False
        self.stop_event.set()
        python = sys.executable
        os.execl(python, python, *sys.argv)

    def check_binding_valid(self):
        try:
            # If your DB schema uses 'current_macs' or just checks existence
            res = supabase.table('room_seat_ip_mappings')\
                .select('id')\
                .eq('layout_id', self.current_layout_id)\
                .eq('seat_number', self.current_seat)\
                .execute()
            # If row is gone, or IP was cleared (logic depends on your Unbind RPC)
            return bool(res.data)
        except: return True

    def update_blocked_resources_list(self):
        try:
            if self.current_room_name:
                # Get Active Exam ID
                room_res = supabase.table('exam_rooms')\
                    .select('id')\
                    .eq('room_name', self.current_room_name)\
                    .order('created_at', desc=True)\
                    .limit(1)\
                    .execute()
                
                if room_res.data:
                    rid = room_res.data[0]['id']
                    res = supabase.table('room_blocked_resources').select('*').eq('room_id', rid).execute()
                    self.current_blocked_resources = res.data
        except: pass

    # === Resource Gathering (Restored Detail) ===
    def get_resource_usage(self):
        data = {}
        # CPU
        try: data["cpu_usage"] = psutil.cpu_percent(interval=0.1)
        except: data["cpu_usage"] = 0
        
        # RAM
        try: 
            m = psutil.virtual_memory()
            data["ram_usage"] = m.percent
            data["ram_used_gb"] = round(m.used / (1024**3), 2)
        except: pass
        
        # Network
        try:
            n = psutil.net_io_counters()
            data["network_download_mb"] = round(n.bytes_recv / (1024**2), 2)
        except: pass

        # Processes (Improved Filter)
        procs = []
        try:
            for p in psutil.process_iter(['pid', 'name', 'cpu_percent']):
                try:
                    if p.info['cpu_percent'] > 0:
                        procs.append(p.info)
                except: pass
        except: pass
        data["exe_processes"] = sorted(procs, key=lambda x: x['cpu_percent'], reverse=True)[:15]

        # Windows
        if gw:
            try:
                w = gw.getActiveWindow()
                data["active_window_title"] = w.title if w else ""
                data["all_open_windows"] = [win.title for win in gw.getAllWindows() if win.title]
            except: pass
        
        data["timestamp"] = datetime.now().isoformat()
        return data

if __name__ == "__main__":
    # === Restored: Background Launcher ===
    if os.name == 'nt' and sys.executable.lower().endswith('python.exe'):
        try:
            python_dir = os.path.dirname(sys.executable)
            pythonw_path = os.path.join(python_dir, 'pythonw.exe')
            if os.path.exists(pythonw_path):
                # Relaunch hidden
                subprocess.Popen([pythonw_path, os.path.abspath(__file__)] + sys.argv[1:], close_fds=True)
                sys.exit()
        except: pass

    agent = ProctorAgent()
    agent.start()