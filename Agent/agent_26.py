import sys
import subprocess
import os
import importlib.util
import time
import json
import threading
import socket
import ctypes
import ipaddress
from datetime import datetime

# ==========================================
# 1. AUTO-SETUP & DEPENDENCY CHECK (CRITICAL)
# ==========================================
def setup_environment():
    # 1.1 Check Python Version
    current_ver = sys.version_info
    print(f"[Setup] System Python: {sys.version.split()[0]}")
    if not (current_ver.major == 3 and current_ver.minor == 11):
        print(f"[Warning] Recommended Python version is 3.11.x (You have {sys.version.split()[0]})")
        # เราแค่เตือน ไม่ force close เพื่อความยืดหยุ่น

    # 1.2 Check & Install Libraries
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
    print("[Setup] Checking required libraries...")
    for import_name, package_name in requirements.items():
        if importlib.util.find_spec(import_name) is None:
            missing.append(package_name)
    
    if missing:
        print(f"[Setup] Missing libraries detected: {', '.join(missing)}")
        print("[Setup] Auto-installing... Please wait.")
        try:
            subprocess.check_call([sys.executable, '-m', 'pip', 'install'] + missing)
            print("[Setup] Installation complete! Restarting Agent...")
            # Restart script to load new libs
            os.execv(sys.executable, [sys.executable] + sys.argv)
        except Exception as e:
            print(f"[Critical Error] Failed to install libraries: {e}")
            input("Press Enter to exit...")
            sys.exit(1)
    else:
        print("[Setup] All libraries are ready.")

# Run setup BEFORE any other imports
setup_environment()

# ==========================================
# 2. IMPORTS
# ==========================================
import psutil
import requests
from supabase import create_client, Client
from flask import Flask, jsonify
from flask_cors import CORS
import tkinter as tk
from tkinter import ttk, messagebox

# Optional imports handled safely
try:
    import pygetwindow as gw
except ImportError:
    gw = None
try:
    import GPUtil
except ImportError:
    GPUtil = None

# ==========================================
# 3. CONFIGURATION & GLOBALS
# ==========================================
SUPABASE_URL = 'https://degptapfdldfvqzzdzcm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZ3B0YXBmZGxkZnZxenpkemNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzODQxODcsImV4cCI6MjA2OTk2MDE4N30.4WuPEggkHpLZT9ZSYvKHImQtcSzfUDpddGsB3M__HG0'

# Configuration
RUN_IN_BACKGROUND = True  # Set to True to hide the console window automatically
BACKGROUND_ENV_FLAG = "FACE_EXAM_BG_CHILD"


def relaunch_without_console_if_needed():
    """Relaunch the current script without console window (more reliable on Windows 11)."""
    if not RUN_IN_BACKGROUND or os.name != 'nt':
        return

    # Prevent relaunch loop
    if os.environ.get(BACKGROUND_ENV_FLAG) == "1":
        return

    try:
        creation_flags = 0
        if hasattr(subprocess, 'CREATE_NO_WINDOW'):
            creation_flags |= subprocess.CREATE_NO_WINDOW
        if hasattr(subprocess, 'DETACHED_PROCESS'):
            creation_flags |= subprocess.DETACHED_PROCESS
        if hasattr(subprocess, 'CREATE_NEW_PROCESS_GROUP'):
            creation_flags |= subprocess.CREATE_NEW_PROCESS_GROUP

        env = os.environ.copy()
        env[BACKGROUND_ENV_FLAG] = "1"

        subprocess.Popen(
            [sys.executable] + sys.argv,
            creationflags=creation_flags,
            close_fds=True,
            cwd=os.getcwd(),
            env=env,
        )
        print("[Agent] Relaunching in background mode (no console window)...")
        sys.exit(0)
    except Exception as e:
        print(f"[Agent] Background relaunch failed, fallback to hide window: {e}")

# Connectivity
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
app = Flask(__name__)
CORS(app)

# Agent State
current_agent = None  # Reference for Flask
LOG_FILE = "agent_backup_data.json"

# ==========================================
# 4. UTILITY FUNCTIONS (Hardware/Network)
# ==========================================
def get_local_ip():
    """Get best local IPv4 (prefer private LAN, avoid loopback/link-local)."""
    # Try route-based detection first
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        routed_ip = s.getsockname()[0]
        s.close()
        if routed_ip and not routed_ip.startswith("127.") and not routed_ip.startswith("169.254."):
            return routed_ip
    except:
        pass

    # Fallback: scan interfaces for best private IPv4
    candidates = []
    try:
        stats = psutil.net_if_stats()
        for interface, addrs in psutil.net_if_addrs().items():
            st = stats.get(interface)
            if st and not st.isup:
                continue
            if _is_virtual_interface(interface):
                continue

            for addr in addrs:
                if getattr(addr, 'family', None) == socket.AF_INET:
                    ip = addr.address
                    if not ip or ip.startswith("127.") or ip.startswith("169.254."):
                        continue
                    try:
                        ip_obj = ipaddress.ip_address(ip)
                        if ip_obj.is_private:
                            candidates.append(ip)
                    except:
                        pass
    except:
        pass

    if candidates:
        # Prefer 10.x first for common campus/company LAN
        ten_net = [ip for ip in candidates if ip.startswith("10.")]
        if ten_net:
            return ten_net[0]
        return candidates[0]

    return "127.0.0.1"


def _is_virtual_interface(interface_name: str) -> bool:
    name = (interface_name or "").lower()
    virtual_keywords = [
        "loopback", "vmware", "virtualbox", "vbox", "hyper-v", "npcap", "tailscale", "wireguard", "tun", "tap"
    ]
    return any(k in name for k in virtual_keywords)


def _normalize_mac(mac: str) -> str:
    return (mac or "").strip().upper().replace("-", ":")

def get_all_macs():
    """Get list of MAC addresses from active, non-virtual interfaces."""
    macs = []
    try:
        stats = psutil.net_if_stats()
        for interface, addrs in psutil.net_if_addrs().items():
            st = stats.get(interface)
            if st and not st.isup:
                continue
            if _is_virtual_interface(interface):
                continue

            for addr in addrs:
                if addr.family == psutil.AF_LINK:
                    mac = _normalize_mac(addr.address)
                    if mac and mac != "00:00:00:00:00:00":
                        macs.append(mac)
    except:
        pass
    return list(set(macs))

# Global Process Cache to maintain state for CPU calculation
process_cache = {}

def get_hw_metrics():
    global process_cache
    """Gather full system metrics (CPU, RAM, Disk, GPU, Network, Processes)"""
    data = {"timestamp": datetime.now().astimezone().isoformat()}

    # CPU
    data["cpu_usage"] = psutil.cpu_percent(interval=None)
    data["cpu_cores"] = psutil.cpu_count()
    
    # ... (Rest of RAM/Disk/GPU/Network code is fine) ...
    # RAM
    mem = psutil.virtual_memory()
    data["ram_usage"] = mem.percent
    data["ram_total_gb"] = round(mem.total / (1024**3), 2)
    data["ram_used_gb"] = round(mem.used / (1024**3), 2)
    data["ram_available_gb"] = round(mem.available / (1024**3), 2)

    # Disk
    disk_parts = []
    try:
        for p in psutil.disk_partitions():
            try:
                u = psutil.disk_usage(p.mountpoint)
                disk_parts.append({
                    "device": p.device,
                    "mountpoint": p.mountpoint,
                    "total_gb": round(u.total / (1024**3), 2),
                    "free_gb": round(u.free / (1024**3), 2),
                    "percent": u.percent
                })
            except: pass
    except: pass
    data["disk_partitions_info"] = disk_parts

    # GPU
    data["gpu_usage"] = 0
    data["gpu_model"] = "Unknown"
    if GPUtil:
        try:
            gpus = GPUtil.getGPUs()
            if gpus:
                data["gpu_usage"] = round(gpus[0].load * 100, 1)
                data["gpu_model"] = gpus[0].name
        except: pass

    # Network
    net = psutil.net_io_counters()
    data["network_download_mb"] = round(net.bytes_recv / (1024**2), 2)
    data["network_upload_mb"] = round(net.bytes_sent / (1024**2), 2)

    # Windows & Processes
    data["active_window_title"] = ""
    data["all_open_windows"] = []
    if gw:
        try:
            active = gw.getActiveWindow()
            if active: data["active_window_title"] = active.title
            
            data["all_open_windows"] = [w.title for w in gw.getAllWindows() if w.title and w.visible]
        except: pass

    # Top Processes (Cached & Stable)
    procs = []
    current_pids = set()
    
    try:
        # Iterate over all running processes
        for p in psutil.process_iter(['pid', 'name', 'exe', 'memory_percent']):
            try:
                pid = p.info['pid']
                current_pids.add(pid)
                
                # Retrieve or initialize cached process object
                if pid in process_cache:
                    cached_p = process_cache[pid]
                else:
                    cached_p = p
                    # First call always returns 0.0, we just init it here
                    try: cached_p.cpu_percent(interval=None) 
                    except: pass
                    process_cache[pid] = cached_p
                
                # Get CPU percent (non-blocking) using the cached object
                # This compares against the last call on this specific object instance
                try:
                    cpu_pct = cached_p.cpu_percent(interval=None)
                except:
                    cpu_pct = 0.0

                mem_pct = p.info['memory_percent'] or 0
                
                # Filter: CPU > 0 OR Memory > 0.1% (Keep application alive in list)
                if cpu_pct > 0 or mem_pct > 0.1:
                    procs.append({
                        'pid': pid,
                        'name': p.info['name'],
                        'cpu_percent': round(cpu_pct, 1),
                        'memory_percent': round(mem_pct, 1)
                    })
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass
                
    except Exception as e:
        print(f"Process Error: {e}")

    # Clean up cache (remove terminated processes)
    # Using list(keys) to avoid runtime error during iteration
    for pid in list(process_cache.keys()):
        if pid not in current_pids:
            del process_cache[pid]

    # Sort: High CPU first, then High Memory
    data["exe_processes"] = sorted(procs, key=lambda x: (x['cpu_percent'], x['memory_percent']), reverse=True)[:20]

    return data

# ==========================================
# 5. AGENT CLASS
# ==========================================
class ExamAgent:
    def __init__(self):
        self.ip = get_local_ip()
        self.macs = get_all_macs()
        self.is_monitoring = False
        
        # Identity
        self.layout_id = None
        self.seat_number = None # String "Row-Col"
        self.row_number = 0
        self.col_number = 0
        self.room_name = None
        
        # Session
        self.current_session_id = None
        self.blocked_resources = []
        self.last_alert_time = 0

        # Flask Link
        global current_agent
        current_agent = self

    def start(self):
        print("\n" + "="*40)
        print(f" FACE EXAM AGENT v2.0")
        print(f" IP: {self.ip}")
        print(f" MACs: {self.macs}")
        print("="*40 + "\n")

        # 1. Start Local API Server (Port 5001)
        self.start_api_server()

        # 2. Check Registration (Auto Login)
        if self.check_existing_registration():
            print(f"[Auth] Auto-login successful -> Room: {self.room_name}, Seat: {self.seat_number}")
            self.run_monitoring_loop()
        else:
            print("[Auth] Device not recognized. Launching Registration GUI...")
            self.show_registration_gui()

    def start_api_server(self):
        """Web dashboard talks to this to verify agent status"""
        t = threading.Thread(target=lambda: app.run(host='0.0.0.0', port=5001, debug=False, use_reloader=False))
        t.daemon = True
        t.start()

    def check_existing_registration(self):
        """
        Smart Check using Supabase RPC `handle_smart_registration`
        Returns True if registered/recovered, False otherwise
        """
        try:
            print("[Auth] Contacting server for smart registration...")
            # Call the Smart RPC function
            response = supabase.rpc('handle_smart_registration', {
                'p_macs': self.macs,
                'p_current_ip': self.ip
            }).execute()

            result = response.data
            return self._handle_reg_result(result)

        except Exception as e:
            # FIX: Handle Postgrest/Supabase "200 OK" Validation Errors
            # The library can throw an error even when the RPC returns valid JSON, especially with code 200
            
            json_data = None
            err_str = str(e)
            
            # Strategy 1: Check Object Attributes (if it's a real APIError object)
            if hasattr(e, 'details') and e.details:
                raw_details = str(e.details) # might be "b'{...}'"
                # Strip python bytes notation if present in string
                if raw_details.startswith("b'") and raw_details.endswith("'"):
                     raw_details = raw_details[2:-1]
                try: 
                    json_data = json.loads(raw_details)
                except: pass
            
            # Strategy 2: Regex extraction from string representation (Backup)
            if not json_data:
                import re
                # Find JSON specifically starting with "status" inside the messed up string
                # Looks for: {"status" ... } inside the 'details': 'b\'...\''
                # We match the inner braces
                match = re.search(r'({[^{]*?"status"[^}]*?})', err_str)
                if match:
                    try:
                        clean_json = match.group(1).replace("\\'", "'").replace('\\"', '"') 
                        # The string might have double escaped quotes from the exception repr
                        # Let's try raw load first, if fail, try manual key check
                        json_data = json.loads(clean_json)
                    except:
                        # Manual Fallback for specific known statuses
                        if '"status" : "NOT_FOUND"' in match.group(1): 
                            json_data = {"status": "NOT_FOUND"}
                        elif '"status" : "SUCCESS"' in match.group(1):
                            # Harder to parse, but let's try
                            pass

            if json_data:
                 return self._handle_reg_result(json_data)

            print(f"[Smart Auth Error] Could not parse response: {e}")
            return False

    def _handle_reg_result(self, result):
        if not result: return False
        status = result.get('status')
        
        if status == 'NOT_FOUND':
            # Explicitly return False so GUI opens
            return False
            
        if status in ['SUCCESS', 'RECOVERED']:
            # Bind Identity from returned data
            self.room_name = result.get('room_name')
            self.seat_number = result.get('seat_number')
            
            # Fetch detailed IDs for internal use
            self.fetch_layout_details()

            # Validate that recovered identity still matches this machine.
            # If not, force manual registration UI.
            if not self.ensure_identity_consistency():
                print("[Auth] Recovered identity does not match this machine. Opening registration UI...")
                self.room_name = None
                self.seat_number = None
                self.layout_id = None
                self.row_number = 0
                self.col_number = 0
                return False
            
            print(f"[Auth] {status}! Connected to {self.room_name} - Seat {self.seat_number}")
            return True
        return False

    def ensure_identity_consistency(self):
        """
        Prevent wrong machine auto-login.
        Rules:
        - If DB seat mapping MAC does not intersect local MACs -> mismatch (force registration)
        - If MAC intersects but IP changed -> auto-heal DB IP to current machine IP
        """
        if not self.layout_id or not self.seat_number:
            return False

        try:
            res = supabase.table('room_seat_ip_mappings')\
                .select('ip_address, current_macs')\
                .eq('layout_id', self.layout_id)\
                .eq('seat_number', self.seat_number)\
                .single().execute()

            if not res.data:
                return False

            db_ip = (res.data.get('ip_address') or '').strip()
            db_macs = set(_normalize_mac(m) for m in (res.data.get('current_macs') or []))
            local_macs = set(_normalize_mac(m) for m in self.macs)
            has_mac_match = bool(local_macs & db_macs)

            if not has_mac_match:
                return False

            if db_ip != self.ip:
                try:
                    supabase.table('room_seat_ip_mappings').update({
                        'ip_address': self.ip,
                        'current_macs': list(local_macs),
                        'updated_at': datetime.now().astimezone().isoformat()
                    }).eq('layout_id', self.layout_id).eq('seat_number', self.seat_number).execute()
                    print(f"[Auth] IP changed for same device: {db_ip} -> {self.ip} (auto-healed)")
                except Exception as e:
                    print(f"[Auth] Failed to auto-heal IP mapping: {e}")

            return True
        except Exception as e:
            print(f"[Auth] Identity consistency check failed: {e}")
            return False

    def fetch_layout_details(self):
        """Helper to get layout_id and other hidden fields after quick login"""
        try:
            # Get Layout ID
            r = supabase.table('room_seat_layouts').select('id, rows, columns').eq('room_name', self.room_name).single().execute()
            if r.data:
                self.layout_id = r.data['id']
                # Parse seat number back to row/col if needed
                if self.seat_number and '-' in self.seat_number:
                    parts = self.seat_number.split('-')
                    self.row_number = int(parts[0])
                    self.col_number = int(parts[1])
        except: pass

    def bind_identity(self, row_data):
        # Legacy method kept for fallback compatibility, but mostly unused now
        pass

    # ----------------------------------------
    # GUI Registration (Fallback)
    # ----------------------------------------
    def show_registration_gui(self):
        root = tk.Tk()
        root.title("ลงทะเบียนเครื่องสอบ (Exam Agent)")
        root.geometry("600x700")  # Adjusted size for grid view
        
        # Center Window
        try:
            root.eval('tk::PlaceWindow . center')
        except: pass

        # Styles
        style = ttk.Style()
        style.configure("Taken.TButton", foreground="gray")
        style.configure("Free.TButton", foreground="black")
        style.configure("Selected.TButton", background="green", foreground="blue")

        ttk.Label(root, text="อุปกรณ์นี้ยังไม่ลงทะเบียน", font=("Tahoma", 16, "bold"), foreground="#d32f2f").pack(pady=15)
        ttk.Label(root, text=f"Your IP: {self.ip}", font=("Tahoma", 10)).pack()
        
        # Main Container
        main_frame = ttk.Frame(root, padding=15)
        main_frame.pack(fill=tk.BOTH, expand=True)

        # --- Top Control: Room Selection ---
        top_frame = ttk.Frame(main_frame)
        top_frame.pack(fill=tk.X, pady=5)
        
        # Inner frame for centering
        top_center_frame = ttk.Frame(top_frame)
        top_center_frame.pack(anchor="center")

        ttk.Label(top_center_frame, text="เลือกห้องสอบ:", font=("Tahoma", 11)).pack(side=tk.LEFT, padx=5)
        
        room_var = tk.StringVar()
        room_cb = ttk.Combobox(top_center_frame, textvariable=room_var, state="readonly", font=("Tahoma", 10), width=30)
        room_cb.pack(side=tk.LEFT, padx=5)

        refresh_btn = ttk.Button(top_center_frame, text="โหลดผังที่นั่ง", command=lambda: load_layout())
        refresh_btn.pack(side=tk.LEFT, padx=5)

        # --- Grid Area (Scrollable) ---
        canvas_frame = ttk.LabelFrame(main_frame, text="ผังที่นั่ง (คลิกเพื่อเลือก)", padding=5)
        # Center the title of LabelFrame if possible, but default is left. style config needed for center title.
        # Alternatively, just pack fill both.
        canvas_frame.pack(fill=tk.BOTH, expand=True, pady=10)

        canvas = tk.Canvas(canvas_frame)
        scrollbar = ttk.Scrollbar(canvas_frame, orient="vertical", command=canvas.yview)
        scrollable_frame = ttk.Frame(canvas)

        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )

        # Center the scrollable frame inside the canvas
        def center_content(event):
            canvas_width = event.width
            frame_width = scrollable_frame.winfo_reqwidth()
            if frame_width < canvas_width:
                canvas.itemconfig(window_item, width=canvas_width) # Expand frame to fit? No, just center.
                # Actually, to center items inside scrollable_frame, we should pack them centered.
            canvas.configure(scrollregion=canvas.bbox("all"))
            
        # Instead of complex canvas centering, let's center the rows inside scrollable_frame
        
        window_item = canvas.create_window((0, 0), window=scrollable_frame, anchor="nw") # defaulting to nw for scroll logic
        
        # To make content centered essentially, we can force the window width to match canvas
        canvas.bind("<Configure>", lambda e: canvas.itemconfig(window_item, width=e.width))

        canvas.configure(yscrollcommand=scrollbar.set)

        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # --- Bottom Control: Selection Info & Submit ---
        bottom_frame = ttk.Frame(main_frame)
        bottom_frame.pack(fill=tk.X, pady=10)

        # Center container for bottom elements
        bottom_center_frame = ttk.Frame(bottom_frame)
        bottom_center_frame.pack(anchor="center")

        selected_seat_var = tk.StringVar(value="-")
        
        ttk.Label(bottom_center_frame, text="ที่นั่งที่เลือก:", font=("Tahoma", 10, "bold")).pack(side=tk.LEFT, padx=5)
        seat_lbl = ttk.Label(bottom_center_frame, textvariable=selected_seat_var, font=("Tahoma", 14, "bold"), foreground="blue")
        seat_lbl.pack(side=tk.LEFT, padx=15)

        submit_btn = ttk.Button(bottom_center_frame, text="ยืนยันการลงทะเบียน", state="disabled")
        submit_btn.pack(side=tk.LEFT, padx=15)

        msg_lbl = ttk.Label(root, text="", foreground="red", font=("Tahoma", 9))
        msg_lbl.pack(pady=5)

        # Data Store
        room_data_map = {} 
        seat_buttons = {}
        current_selection = {"row": None, "col": None, "seat_num": None}

        # --- Functions ---

        def load_rooms():
            try:
                res = supabase.table('room_seat_layouts').select('id, room_name, rows, columns').execute()
                for r in res.data:
                    room_data_map[r['room_name']] = r
                room_cb['values'] = list(room_data_map.keys())
            except Exception as e:
                msg_lbl.config(text=f"Error loading rooms: {e}")

        def on_seat_click(r, c, seat_str, is_taken, taken_by_ip):
            # Reset previous button style
            prev = current_selection['seat_num']
            if prev and prev in seat_buttons:
                # Revert style based on taken status
                was_taken = seat_buttons[prev]['taken']
                btn_prev = seat_buttons[prev]['btn']
                # UPDATED COLORS: Free=White, Taken=Green
                color_prev = "white" if not was_taken else "#81c784" 
                btn_prev.config(bg=color_prev, relief="raised")

            # Set new selection
            current_selection['row'] = r
            current_selection['col'] = c
            current_selection['seat_num'] = seat_str
            
            # Highlight Current (Grey)
            btn_curr = seat_buttons[seat_str]['btn']
            btn_curr.config(bg="#bdbdbd", relief="sunken") # Grey highlight

            selected_seat_var.set(f"{seat_str}")
            if is_taken:
                msg_lbl.config(text=f"คำเตือน: ที่นั่งนี้มีคนลงไว้แล้ว (IP: {taken_by_ip}) หากยืนยันจะทับสิทธิ์เดิม", foreground="#f57f17")
            else:
                msg_lbl.config(text="", foreground="black")

            submit_btn.config(state="normal")

        def load_layout():
            r_name = room_var.get()
            if not r_name: return

            # Clear old grid
            for widget in scrollable_frame.winfo_children():
                widget.destroy()
            seat_buttons.clear()
            current_selection['seat_num'] = None
            selected_seat_var.set("")
            submit_btn.config(state="disabled")

            room_info = room_data_map.get(r_name)
            if not room_info: return

            rows = room_info['rows']
            cols = room_info['columns']
            layout_id = room_info['id']

            try:
                # Fetch occupied seats
                taken_res = supabase.table('room_seat_ip_mappings')\
                    .select('row_number, column_number, ip_address')\
                    .eq('layout_id', layout_id)\
                    .execute()
                
                occupied_map = {} # "r-c" -> ip
                for t in taken_res.data:
                    key = f"{t['row_number']}-{t['column_number']}"
                    occupied_map[key] = t.get('ip_address', 'Unknown')

                # --- Front of Room Banner ---
                # A styled Canvas or Label to represent the front board
                # We can use a Frame with a dark background and white text
                
                # Check approximate width needed based on columns (12 chars width ~ 90px + padding) * cols
                # But since we use pack, we can just let it fill or set a min width
                
                front_frame = tk.Frame(scrollable_frame, bg="#1a237e", height=40)
                front_frame.pack(fill=tk.X, pady=(10, 20), padx=50) # Padding to make it look like a board
                
                tk.Label(
                    front_frame, 
                    text="กระดานหน้าห้อง (Front)", 
                    font=("Tahoma", 12, "bold"), 
                    bg="#1a237e", 
                    fg="white"
                ).pack(pady=5)

                # Render Grid
                first_row = True
                for r in range(1, rows + 1):
                    # Use a frame that centers its content
                    row_frame = ttk.Frame(scrollable_frame)
                    row_frame.pack(pady=2, anchor="center") # Anchor center to middle of scrollable_frame
                    
                    for c in range(1, cols + 1):
                        seat_str = f"{r}-{c}"
                        key = f"{r}-{c}"
                        is_taken = key in occupied_map
                        taken_ip = occupied_map.get(key, "")

                        # Style
                        if not is_taken:
                            btn_text = f"{seat_str}\n(ว่าง)"
                            color = "white"
                        else:
                            btn_text = f"{seat_str}\n{taken_ip}"
                            color = "#81c784" # Green for taken

                        # Using tk.Button for better color control than ttk
                        btn = tk.Button(
                            row_frame, 
                            text=btn_text, 
                            width=12, 
                            height=3, 
                            bg=color,
                            command=lambda r=r, c=c, s=seat_str, t=is_taken, ip=taken_ip: on_seat_click(r, c, s, t, ip)
                        )
                        btn.pack(side=tk.LEFT, padx=2)
                        
                        seat_buttons[seat_str] = {'btn': btn, 'taken': is_taken}
            except Exception as e:
                msg_lbl.config(text=f"Error loading layout: {e}")

        def submit_registration():
            s_num = current_selection['seat_num']
            r_name = room_var.get()
            
            if not s_num or not r_name: return

            try:
                room_info = room_data_map.get(r_name)
                layout_id = room_info['id']
                
                row_n = current_selection['row']
                col_n = current_selection['col']

                # Same UPSERT logic as before
                new_mapping = {
                    "layout_id": layout_id,
                    "seat_number": s_num,
                    "row_number": row_n,
                    "column_number": col_n,
                    "ip_address": self.ip,
                    "current_macs": self.macs,
                    "updated_at": datetime.now().astimezone().isoformat()
                }

                supabase.table('room_seat_ip_mappings').upsert(new_mapping, on_conflict='layout_id, seat_number').execute()
                
                messagebox.showinfo("สำเร็จ", "ลงทะเบียนเรียบร้อย!")
                root.destroy()
                
                # Update Self
                self.room_name = r_name
                self.seat_number = s_num
                self.layout_id = layout_id
                
                # Start Loop
                threading.Thread(target=self.run_monitoring_loop).start()
            
            except Exception as e:
                print(f"Reg Error: {e}")
                msg_lbl.config(text=str(e))

        # Init
        room_cb.bind("<<ComboboxSelected>>", lambda e: load_layout())
        submit_btn.config(command=submit_registration)
        load_rooms()
        
        root.mainloop()

        ''' OLD CODE REMOVED
        frame = ttk.Frame(root, padding=20)
        ...
        '''

    # ----------------------------------------
    # Monitoring Loop
    # ----------------------------------------
    def hide_console(self):
        """Hides the console window if configured to run in background."""
        if RUN_IN_BACKGROUND:
            print("[Agent] Background Mode Enabled. Hiding console in 3 seconds...")
            # We use a timer to let the user read the message
            def _hide():
                time.sleep(3)
                try:
                    hwnd = ctypes.windll.kernel32.GetConsoleWindow()
                    if hwnd != 0:
                        try:
                            ctypes.windll.user32.ShowWindowAsync(hwnd, 0) # SW_HIDE
                        except:
                            pass
                        ctypes.windll.user32.ShowWindow(hwnd, 0) # SW_HIDE
                        try:
                            ctypes.windll.kernel32.FreeConsole()
                        except:
                            pass
                except: pass
            threading.Thread(target=_hide, daemon=True).start()

    def run_monitoring_loop(self):
        print(f"\n[Agent] READY - Monitoring Room: {self.room_name} | Seat: {self.seat_number}")
        print("[Agent] Waiting for Exam Session...")
        
        # Try to hide console now that we are running
        self.hide_console()

        while True:
            try:
                # 0. Check Identity (Admin Unbind Check)
                if not self.check_identity_validity():
                    print("\n[Auth] Identity lost (Unbound by Admin). resetting...")
                    self.reset_to_registration()
                    return # Exit this loop thread

                # 1. Check for Active Session
                session = self.poll_active_session()
                
                if session:
                    if self.current_session_id != session['id']:
                        print(f"\n[Session STARTED] Student: {session['student_name']} ({session['student_email']})")
                        self.current_session_id = session['id']
                        # Fetch rules when session starts
                        self.update_blocked_resources_list(self.room_name)
                    
                    # 2. Monitor & Enforce
                    metrics = get_hw_metrics()
                    self.check_violations(metrics)
                    
                    # 3. Log to Cloud (every 5 sec to reduce load)
                    if int(time.time()) % 5 == 0:
                        self.save_logs(metrics)
                        
                else:
                    if self.current_session_id:
                        print("\n[Session ENDED]")
                        self.current_session_id = None
                
                # OPTIMIZATION: Check status every 5 seconds to prevent UI flickering from PyGetWindow polling
                time.sleep(5)
                
            except Exception as e:
                print(f"[Loop Error] {e}")
                time.sleep(5)

    def check_identity_validity(self):
        """Checks if we are still assigned to the seat in DB"""
        if not self.layout_id or not self.seat_number: return False
        try:
            # Query the mapping for my seat
            res = supabase.table('room_seat_ip_mappings')\
                .select('current_macs')\
                .eq('layout_id', self.layout_id)\
                .eq('seat_number', self.seat_number)\
                .single().execute()
            
            if res.data:
                db_macs = res.data.get('current_macs', [])
                # If DB macs is empty or I am not in it -> Unbound
                if not db_macs: return False
                
                # Check intersection (Any of my MACs present?)
                # Note: db_macs is list from JSONB
                return bool(set(self.macs) & set(db_macs))
            else:
                return False # Seat row deleted?
        except:
            return True # Network error, assume valid to keep running
            
    def reset_to_registration(self):
        """Stop monitoring and reopen GUI"""
        self.current_session_id = None
        self.layout_id = None
        self.seat_number = None
        self.room_name = None
        
        # Unhide Console if hidden (Optional, hard to do reliability without hWnd)
        try:
            hwnd = ctypes.windll.kernel32.GetConsoleWindow()
            if hwnd != 0: ctypes.windll.user32.ShowWindow(hwnd, 5) # SW_SHOW
        except: pass
        
        print("[System] Launching Registration GUI...")
        # Must run GUI in main thread or safe way. 
        # Since run_monitoring_loop is in a thread, we can just call show_registration_gui directly?
        # Tkinter requires main thread usually. This is tricky.
        # Ideally, we signal the main thread. But here we are simple.
        # We will try to launch it here.
        self.get_gui_in_thread()

    def get_gui_in_thread(self):
        # Wrapper to run GUI
        self.show_registration_gui()

    def poll_active_session(self):
        try:
            # Query Session relevant to this Layout & Seat
            res = supabase.table('exam_student_sessions')\
                .select('*')\
                .eq('layout_id', self.layout_id)\
                .eq('seat_number', self.seat_number)\
                .eq('is_active', True)\
                .execute()
            
            if res.data:
                return res.data[0]
            return None
        except:
            return None

    def update_blocked_resources_list(self, room_name):
        try:
            # Step 1: Get Active Exam Room ID
            r = supabase.table('exam_rooms')\
                .select('id')\
                .eq('room_name', room_name)\
                .eq('is_active', True)\
                .execute()
            
            if not r.data:
                self.blocked_resources = []
                return

            room_id = r.data[0]['id']

            # Step 2: Get Rules
            rules = supabase.table('room_blocked_resources')\
                .select('*')\
                .eq('room_id', room_id)\
                .execute()
            
            self.blocked_resources = rules.data
            print(f"[Rules] Loaded {len(self.blocked_resources)} blocking rules.")

        except Exception as e:
            print(f"[Rules Error] {e}")

    def check_violations(self, metrics):
        if not self.blocked_resources: return

        active_title = metrics.get('active_window_title', '').lower()
        all_windows = [w.lower() for w in metrics.get('all_open_windows', [])]
        processes = [p['name'].lower() for p in metrics.get('exe_processes', [])]
        
        violations = []

        for rule in self.blocked_resources:
            pattern = rule['pattern'].lower()
            match_type = rule.get('match_type', 'contains')
            
            is_hit = False
            hit_source = ""

            # Helper for matching
            def check(text):
                if match_type == 'exact': return pattern == text
                return pattern in text

            # 1. Check Active Window
            if active_title and check(active_title):
                is_hit = True
                hit_source = f"Active Window: {active_title}"
                self.close_window(active_title)

            # 2. Check Background Windows
            if not is_hit:
                for w in all_windows:
                    if check(w):
                        is_hit = True
                        hit_source = f"Background Window: {w}"
                        self.close_window(w)
            
            # 3. Check Processes
            if not is_hit:
                for p in processes:
                    if check(p):
                        is_hit = True
                        hit_source = f"Process: {p}"
                        self.kill_process(p)

            if is_hit:
                violations.append(hit_source)
                print(f"[VIOLATION] Found {hit_source} (Rule: {pattern})")

        # Alert Logic (Once every 10s)
        if violations and (time.time() - self.last_alert_time > 10):
            self.last_alert_time = time.time()
            msg = f"ตรวจพบโปรแกรมต้องห้าม:\n{violations[0]}\nระบบกำลังปิดโปรแกรมดังกล่าว"
            threading.Thread(target=lambda: ctypes.windll.user32.MessageBoxW(0, msg, "Warning", 0x30 | 0x40000)).start()
            
            # Log Violation
            self.log_violation(violations[0])

    def close_window(self, partial_title):
        if not gw: return
        try:
            for w in gw.getWindowsWithTitle(partial_title):
                w.close()
        except: pass

    def kill_process(self, proc_name_part):
        try:
            for p in psutil.process_iter(['name']):
                if proc_name_part in p.info['name'].lower():
                    p.terminate()
        except: pass

    def log_violation(self, detail):
        try:
            supabase.table('violation_logs').insert({
                "session_id": self.current_session_id,
                "timestamp": datetime.now().astimezone().isoformat(),
                "violation_type": "PROHIBITED_APP",
                "resource_name": detail,
                "action_taken": "TERMINATED",
                "details": detail
            }).execute()
        except: pass

    def save_logs(self, metrics):
        if not self.current_session_id: return
        try:
            # Map metrics to DB schema
            payload = {
                "session_id": self.current_session_id,
                "timestamp": metrics["timestamp"],
                "active_window_title": metrics.get("active_window_title"),
                "all_open_windows": metrics.get("all_open_windows", []),
                "cpu_usage": int(metrics.get("cpu_usage", 0)),
                "ram_usage": int(metrics.get("ram_usage", 0)),
                "cpu_model": str(psutil.cpu_count()) + " Cores", # Simplify
                "ram_total_gb": metrics.get("ram_total_gb"),
                "ram_used_gb": metrics.get("ram_used_gb"),
                "ram_available_gb": metrics.get("ram_available_gb"),
                "disk_partitions_info": metrics.get("disk_partitions_info", []),
                "network_download_mb": metrics.get("network_download_mb"),
                "network_upload_mb": metrics.get("network_upload_mb"),
                "exe_processes": metrics.get("exe_processes", [])
            }
            supabase.table('resource_logs').insert(payload).execute()
        except Exception as e:
            # print(f"Log Error: {e}")
            pass

# ==========================================
# 6. FLASK ROUTES
# ==========================================
@app.route('/api/get-ip', methods=['GET'])
def api_get_ip():
    if current_agent: return jsonify({"ip_address": current_agent.ip})
    return jsonify({"ip_address": "127.0.0.1"})

@app.route('/api/resource-usage', methods=['GET'])
def api_metrics():
    return jsonify(get_hw_metrics())

# ==========================================
# 7. MAIN ENTRY
# ==========================================
if __name__ == "__main__":
    relaunch_without_console_if_needed()
    agent = ExamAgent()
    agent.start()
