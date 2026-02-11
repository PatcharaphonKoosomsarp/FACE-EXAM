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
        self.current_session_id = None
        self.current_blocked_resources = []
        self.last_alert_time = 0
        
        # Identity
        self.ip, self.macs = MachineIdentity.get_identities()
        print(f"[Identity] IP: {self.ip}")
        print(f"[Identity] MACs: {self.macs}")

    def start(self):
        """Entry point"""
        # self.auto_setup_dependencies() # Optional: Add back if needed
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
            self.fetch_layout_id()
            self.start_monitoring_loop()
        else:
            print("[Info] Machine not found in history. Launching Registration GUI...")
            self.launch_gui() # Blocks until registered

    def fetch_layout_id(self):
        try:
            res = supabase.table('room_seat_layouts').select('id').eq('room_name', self.current_room_name).execute()
            if res.data:
                self.current_layout_id = res.data[0]['id']
        except Exception as e:
            print(f"[Error] Fetch layout ID failed: {e}")

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
            self.start_monitoring_loop()
            
        except Exception as e:
            self.status_lbl.config(text=f"Error: {str(e)}")
            print(e)

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
        self.update_blocked_resources_list()

        while not self.stop_event.is_set():
            try:
                # 1. Heartbeat Check (Admin Reset)
                if not self.check_binding_valid():
                    print("[System] Seat Unbound/Reset by Admin. Restarting...")
                    self.restart_application()
                    break

                # 2. Get Resources
                resources = self.get_resource_usage()
                
                # 3. Check Violations
                self.check_for_violations(resources)

                # 4. Log to Supabase (if needed - throttling to avoid spam)
                # (Optional: Only log if violation or every X seconds)
                
                # 5. Periodic Updates
                if int(time.time()) % 60 == 0:
                    self.update_blocked_resources_list()

                time.sleep(3) # Check every 3 seconds
                
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

    # === Resource & Violation Detection ===
    def get_resource_usage(self):
        try:
            cpu = psutil.cpu_percent(interval=None)
            mem = psutil.virtual_memory()
            
            # Active Window
            title = ""
            if gw:
                try:
                    w = gw.getActiveWindow()
                    if w: title = w.title
                except: pass
            
            # All Windows
            all_wins = []
            if gw:
                try:
                    all_wins = [w.title for w in gw.getAllWindows() if w.title]
                except: pass

            # Processes (Simplified for perf)
            # Fetch full list is expensive, maybe just check names against blocklist?
            # For now, return basic info
            return {
                "cpu_usage": cpu,
                "ram_usage": mem.percent,
                "active_window_title": title,
                "all_open_windows": all_wins,
                "timestamp": datetime.now().isoformat()
            }
        except:
            return {}

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
                # Log to DB here...

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
