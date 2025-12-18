import psutil
import pygetwindow as gw
import time
import json
import requests
import threading
import ctypes  # For MessageBox
from datetime import datetime
import os
import socket
from supabase import create_client, Client
from flask import Flask, jsonify
from flask_cors import CORS
try:
    import GPUtil
except ImportError:
    GPUtil = None
    print("Warning: GPUtil not installed. GPU monitoring will be disabled.")
try:
    import wmi
except ImportError:
    wmi = None
    print("Warning: WMI not installed. Some hardware info will be limited.")
try:
    import platform
except ImportError:
    platform = None

# === Supabase Configuration ===
SUPABASE_URL = 'https://degptapfdldfvqzzdzcm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZ3B0YXBmZGxkZnZxenpkemNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzODQxODcsImV4cCI6MjA2OTk2MDE4N30.4WuPEggkHpLZT9ZSYvKHImQtcSzfUDpddGsB3M__HG0'

# สร้าง Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# สร้าง Flask app
app = Flask(__name__)
CORS(app)  # เปิดใช้งาน CORS สำหรับ cross-origin requests

# === Flask API Routes ===
@app.route('/api/resource-usage', methods=['GET'])
def get_resource_usage_api():
    """
    API endpoint สำหรับดึงข้อมูลการใช้งานทรัพยากรระบบ
    """
    try:
        resource_data = get_resource_usage()
        return jsonify({
            'success': True,
            'data': resource_data
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/get-ip', methods=['GET'])
def get_ip_api():
    """
    API endpoint สำหรับดึงข้อมูล IP address เท่านั้น
    """
    try:
        # ดึงเฉพาะ IP address
        ip_address = get_client_ip()
        
        return jsonify({
            'ip_address': ip_address
        })
    except Exception as e:
        return jsonify({
            'ip_address': '127.0.0.1'
        }), 500

@app.route('/api/test', methods=['GET'])
def test_api():
    """
    Simple test endpoint
    """
    return jsonify({'message': 'Test endpoint working'})



# === Global Variables ===
is_monitoring_active = False
current_session_id = None
monitoring_thread = None
log_file = "data.json"  # สำหรับ backup ในกรณีที่ Supabase ไม่พร้อมใช้งาน
current_blocked_resources = []
current_session_info = {}  # เก็บข้อมูล session ปัจจุบัน (student, room, seat)
last_alert_time = 0  # Cooldown สำหรับการแจ้งเตือน

def set_session_info(info):
    """เก็บข้อมูล Session ปัจจุบัน"""
    global current_session_info
    current_session_info = info

def set_blocked_resources(resources):
    """เก็บรายการ Blocked Resources"""
    global current_blocked_resources
    current_blocked_resources = resources

def show_alert_message(title, message):
    """แสดง Message Box แจ้งเตือน (รันใน Thread แยก)"""
    try:
        print(f"[ALERT] Displaying MessageBox: {title} - {message}")
        # MB_ICONWARNING = 0x30, MB_TOPMOST = 0x40000, MB_OK = 0x0
        ctypes.windll.user32.MessageBoxW(0, message, title, 0x30 | 0x40000 | 0x0)
    except Exception as e:
        print(f"Error showing alert: {e}")

def save_violation_log(violation_type, resource_name, action_taken, details):
    """
    บันทึกข้อมูลการละเมิดกฎลงใน Supabase violation_logs
    """
    global current_session_id
    
    if not current_session_id:
        return

    try:
        # ใช้ datetime.now().astimezone().isoformat() เพื่อส่ง Timezone Offset ไปด้วย
        data = {
            "session_id": current_session_id,
            "timestamp": datetime.now().astimezone().isoformat(),
            "violation_type": violation_type,
            "resource_name": resource_name,
            "action_taken": action_taken,
            "details": details
        }
        
        supabase.table('violation_logs').insert(data).execute()
        print(f"Agent: บันทึก Violation ({resource_name}) ลง Supabase สำเร็จ")
    except Exception as e:
        print(f"Agent: ไม่สามารถบันทึก Violation ได้: {e}")

def check_violations(resources):
    """
    ตรวจสอบว่ามีการเปิดโปรแกรมหรือหน้าต่างที่ถูกบล็อกหรือไม่
    และทำการปิดโปรแกรมนั้นทันที
    """
    global current_blocked_resources, current_session_info, last_alert_time
    
    if not current_blocked_resources:
        return

    violations = []
    
    # ตรวจสอบ Active Window
    active_window = resources.get("active_window_title", "")
    
    # ตรวจสอบ All Open Windows
    all_windows = resources.get("all_open_windows", [])

    # ตรวจสอบ Running Processes (ใช้ข้อมูลเต็มเพื่อเอา PID)
    process_list = resources.get("exe_processes", [])
    
    for rule in current_blocked_resources:
        pattern = rule.get('pattern', '').lower()
        match_type = rule.get('match_type', 'contains')
        
        # --- Helper Logic for Matching ---
        def is_match(text):
            text = text.lower()
            # 1. Exact Match
            if match_type == 'exact':
                return pattern == text
            
            # 2. Contains Match (Standard)
            if pattern in text:
                return True
                
            # 3. Smart URL/Domain Match (สำหรับกรณี pattern เป็น URL เช่น https://www.youtube.com/)
            if match_type == 'contains' and ('.' in pattern or 'http' in pattern):
                # Clean up protocol and www
                clean = pattern.replace("https://", "").replace("http://", "").replace("www.", "")
                # Remove path (e.g. youtube.com/watch -> youtube.com)
                if '/' in clean:
                    clean = clean.split('/')[0]
                
                # Split domain parts (e.g. gemini.google.com -> [gemini, google, com])
                parts = clean.split('.')
                
                # Filter significant parts (ignore com, org, etc.)
                significant_parts = [p for p in parts if len(p) >= 3 and p not in ['com', 'org', 'net', 'co', 'th', 'edu', 'gov', 'info', 'io', 'www']]
                
                if significant_parts:
                    # ใช้เฉพาะส่วนแรกที่เป็นเอกลักษณ์ที่สุด (เช่น 'gemini' จาก 'gemini.google.com')
                    # เพื่อป้องกันการบล็อกคำทั่วไปเช่น 'google' ที่อาจติดมาด้วย
                    keyword = significant_parts[0]
                    if keyword in text:
                        return True
                        
            return False
        # ---------------------------------

        is_violation = False
        detected_source = ""
        action_taken = ""
        
        # 1. Check Active Window
        if active_window and is_match(active_window):
            is_violation = True
            detected_source = f"Active Window: {active_window}"
            # Close Window
            try:
                windows = gw.getWindowsWithTitle(active_window)
                for w in windows:
                    if w.title == active_window:
                        w.close()
                        action_taken = "[Closed]"
            except Exception as e:
                print(f"Error closing active window: {e}")

        # 2. Check All Open Windows (ถ้ายังไม่เจอ หรือเจอแล้วแต่อยากปิดให้หมด)
        if not is_violation: 
            for win_title in all_windows:
                if is_match(win_title):
                    is_violation = True
                    detected_source = f"Background Window: {win_title}"
                    # Close Window
                    try:
                        windows = gw.getWindowsWithTitle(win_title)
                        for w in windows:
                            if w.title == win_title:
                                w.close()
                                action_taken = "[Closed]"
                    except Exception as e:
                        print(f"Error closing background window: {e}")
                    break 

        # 3. Check Processes (ถ้ายังไม่เจอ)
        if not is_violation:
            for proc in process_list:
                proc_name = proc['name']
                if is_match(proc_name):
                    is_violation = True
                    detected_source = f"Process: {proc_name}"
                    # Kill Process
                    try:
                        p = psutil.Process(proc['pid'])
                        p.terminate()
                        action_taken = "[Terminated]"
                    except Exception as e:
                        print(f"Error terminating process: {e}")
                    break
        
        if is_violation:
            violations.append(f"{rule.get('pattern')} ({detected_source}) {action_taken}")
            
            # Determine violation type
            v_type = "UNKNOWN"
            if "Active Window" in detected_source: v_type = "ACTIVE_WINDOW"
            elif "Background Window" in detected_source: v_type = "BACKGROUND_WINDOW"
            elif "Process" in detected_source: v_type = "PROCESS"
            
            # Clean action string
            action_clean = action_taken.replace("[", "").replace("]", "") if action_taken else "DETECTED"

            # Log to Supabase (Run in thread to avoid blocking)
            threading.Thread(target=save_violation_log, args=(
                v_type, 
                detected_source, 
                action_clean, 
                f"Matched Rule: {rule.get('pattern')} ({rule.get('match_type')})"
            )).start()

    if violations:
        print(f"\n[VIOLATION DETECTED] Room: {current_session_info.get('room_name', 'Unknown')} | Seat: {current_session_info.get('seat_number', '?')} | Student: {current_session_info.get('student_name', 'Unknown')}")
        print(f"   Blocked items found: {', '.join(violations)}")
        
        # แจ้งเตือนผ่าน Message Box (มี Cooldown 10 วินาที)
        current_time = time.time()
        if current_time - last_alert_time > 10:
            last_alert_time = current_time
            alert_msg = f"ระบบได้ทำการปิดโปรแกรมที่ไม่อนุญาตอัตโนมัติ:\n\n" + "\n".join(violations) + "\n\nกรุณาอย่าเปิดโปรแกรมเหล่านี้ระหว่างการสอบ!"
            threading.Thread(target=show_alert_message, args=("แจ้งเตือนการละเมิดกฎการสอบ", alert_msg)).start()

    if violations:
        print(f"\n[VIOLATION DETECTED] Room: {current_session_info.get('room_name', 'Unknown')} | Seat: {current_session_info.get('seat_number', '?')} | Student: {current_session_info.get('student_name', 'Unknown')}")
        print(f"   Blocked items found: {', '.join(violations)}")
        
        # แจ้งเตือนผ่าน Message Box (มี Cooldown 10 วินาที)
        current_time = time.time()
        if current_time - last_alert_time > 10:
            last_alert_time = current_time
            alert_msg = f"ตรวจพบการใช้งานโปรแกรมที่ไม่อนุญาต:\n\n" + "\n".join(violations) + "\n\nกรุณาปิดโปรแกรมเหล่านี้ทันที มิฉะนั้นจะถูกบันทึกการทุจริต!"
            threading.Thread(target=show_alert_message, args=("แจ้งเตือนการละเมิดกฎการสอบ", alert_msg)).start()

        # TODO: ส่งข้อมูล Violation ไปยัง Server (ถ้ามีตารางรองรับ)

def start_monitoring():
    """
    เริ่มต้นการตรวจสอบทรัพยากร
    """
    global is_monitoring_active, monitoring_thread
    
    if not is_monitoring_active:
        monitor_loop()

def stop_monitoring():
    """
    หยุดการตรวจสอบทรัพยากร
    """
    global is_monitoring_active, current_session_id
    
    is_monitoring_active = False
    current_session_id = None


def get_active_window_title():
    """
    ดึงชื่อหน้าต่างที่กำลังทำงานอยู่
    """
    try:
        active_window = gw.getActiveWindow()
        if active_window:
            return active_window.title
        return ""
    except Exception as e:
        print(f"Error getting window title: {e}")
        return ""

def get_all_open_windows():
    """
    ดึงรายชื่อหน้าต่างทั้งหมดที่เปิดอยู่บนหน้าจอ
    """
    try:
        window_titles = []
        windows = gw.getAllWindows()
        
        for window in windows:
            # กรองเฉพาะหน้าต่างที่มีชื่อและมองเห็นได้
            if window.title and window.title.strip() and window.visible:
                window_titles.append(window.title.strip())
        
        # เรียงลำดับตามชื่อ
        window_titles.sort()
        
        return window_titles
        
    except Exception as e:
        print(f"Error getting all windows: {e}")
        return []

def get_exe_processes():
    """Get list of all .exe processes sorted by CPU usage"""
    try:
        exe_processes = []
        for proc in psutil.process_iter(['pid', 'name', 'exe', 'cpu_percent', 'memory_percent', 'memory_info']):
            try:
                # ใช้ proc.info['exe'] เพื่อกรองจากไฟล์ที่รันโดยตรง
                if proc.info['exe'] and proc.info['exe'].lower().endswith('.exe'):
                    mem_info = proc.info.get('memory_info')
                    exe_processes.append({
                        'pid': proc.info['pid'],
                        'name': os.path.basename(proc.info['exe']),
                        'exe_path': proc.info['exe'],
                        'cpu_percent': proc.info['cpu_percent'] or 0,
                        'memory_percent': proc.info['memory_percent'] or 0,
                        'memory_info': {'rss': mem_info.rss, 'vms': mem_info.vms} if mem_info else None
                    })
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
        
        # Sort by CPU usage (descending)
        exe_processes.sort(key=lambda x: x['cpu_percent'], reverse=True)
        return exe_processes  # Return all processes
    except Exception as e:
        print(f"Error getting exe processes: {e}")
        return []



def get_cpu_info():
    """ดึงข้อมูล CPU"""
    try:
        processor_name = platform.processor()
        cpu_cores = psutil.cpu_count()
        cpu_model = f"{processor_name} ({cpu_cores} cores)"
        cpu_usage = psutil.cpu_percent(interval=0.1)  # ลดเวลา interval
        cpu_frequency = psutil.cpu_freq().current if psutil.cpu_freq() else 0
        return {
            "processor_name": processor_name,
            "cpu_cores": cpu_cores,
            "cpu_model": cpu_model,
            "cpu_usage": cpu_usage,
            "cpu_frequency": cpu_frequency
        }
    except Exception as e:
        print(f"Error getting CPU info: {e}")
        return {
            "processor_name": "Unknown",
            "cpu_cores": 0,
            "cpu_model": "Unknown",
            "cpu_usage": 0.0,
            "cpu_frequency": 0.0
        }

def get_memory_info():
    """ดึงข้อมูล RAM"""
    try:
        memory = psutil.virtual_memory()
        return {
            "ram_total_gb": round(memory.total / (1024**3), 2),
            "ram_used_gb": round(memory.used / (1024**3), 2),
            "ram_available_gb": round(memory.available / (1024**3), 2),
            "ram_usage": memory.percent,
            "total_memory_gb": round(memory.total / (1024**3), 2),
            "available_memory_gb": round(memory.available / (1024**3), 2)
        }
    except Exception as e:
        print(f"Error getting memory info: {e}")
        return {
            "ram_total_gb": 0.0,
            "ram_used_gb": 0.0,
            "ram_available_gb": 0.0,
            "ram_usage": 0.0,
            "total_memory_gb": 0.0,
            "available_memory_gb": 0.0
        }

def get_disk_info():
    """ดึงข้อมูล Disk"""
    try:
        disk_partitions_info = []
        partitions = psutil.disk_partitions()
        disk_total_gb = 0
        disk_free_gb = 0
        for p in partitions:
            try:
                usage = psutil.disk_usage(p.mountpoint)
                partition_info = {
                    "device": p.device,
                    "total_gb": round(usage.total / (1024**3), 2),
                    "used_gb": round(usage.used / (1024**3), 2),
                    "free_gb": round(usage.free / (1024**3), 2),
                    "percent": round(usage.percent, 1)
                }
                disk_partitions_info.append(partition_info)
                disk_total_gb += partition_info["total_gb"]
                disk_free_gb += partition_info["free_gb"]
            except PermissionError:
                continue
        
        # Disk I/O
        disk_io = psutil.disk_io_counters()
        disk_read_kb = round(disk_io.read_bytes / 1024, 2) if disk_io else 0
        disk_write_kb = round(disk_io.write_bytes / 1024, 2) if disk_io else 0
        
        return {
            "disk_partitions_info": disk_partitions_info,
            "disk_read_kb": disk_read_kb,
            "disk_write_kb": disk_write_kb,
            "disk_total_gb": disk_total_gb,
            "disk_free_gb": disk_free_gb,
            "disk_type": "Unknown"
        }
    except Exception as e:
        print(f"Error getting disk info: {e}")
        return {
            "disk_partitions_info": [],
            "disk_read_kb": 0,
            "disk_write_kb": 0,
            "disk_total_gb": 0.0,
            "disk_free_gb": 0.0,
            "disk_type": "Unknown"
        }

def get_gpu_info():
    """ดึงข้อมูล GPU"""
    try:
        gpu_usage = 0
        gpu_model = "Unknown"
        if GPUtil:
            try:
                gpus = GPUtil.getGPUs()
                if gpus:
                    gpu = gpus[0]
                    gpu_usage = round(gpu.load * 100, 1)
                    gpu_model = gpu.name
            except Exception as e:
                print(f"Error getting GPU info: {e}")
        return {
            "gpu_usage": gpu_usage,
            "gpu_model": gpu_model
        }
    except Exception as e:
        print(f"Error getting GPU info: {e}")
        return {
            "gpu_usage": 0,
            "gpu_model": "Unknown"
        }

def get_network_info():
    """ดึงข้อมูล Network"""
    try:
        net = psutil.net_io_counters()
        if net:
            network_download_mb = round(net.bytes_recv / (1024**2), 2)
            network_upload_mb = round(net.bytes_sent / (1024**2), 2)
        else:
            network_download_mb = 0.0
            network_upload_mb = 0.0
        
        network_speed_kbps = 0  # Default value
        network_type = "Unknown"
        
        return {
            "network_download_mb": network_download_mb,
            "network_upload_mb": network_upload_mb,
            "network_speed_kbps": network_speed_kbps,
            "network_type": network_type
        }
    except Exception as e:
        print(f"Error getting network info: {e}")
        return {
            "network_download_mb": 0.0,
            "network_upload_mb": 0.0,
            "network_speed_kbps": 0,
            "network_type": "Unknown"
        }

def get_resource_usage():
    """ดึงข้อมูลการใช้งานทรัพยากรระบบ"""
    try:
        # ดึงข้อมูลจากแต่ละฟังก์ชัน
        cpu_info = get_cpu_info()
        memory_info = get_memory_info()
        disk_info = get_disk_info()
        gpu_info = get_gpu_info()
        network_info = get_network_info()
        exe_processes = get_exe_processes()
        
        # รวมข้อมูลทั้งหมด
        result = {}
        result.update(cpu_info)
        result.update(memory_info)
        result.update(disk_info)
        result.update(gpu_info)
        result.update(network_info)
        result["active_window_title"] = get_active_window_title()
        result["all_open_windows"] = get_all_open_windows()
        result["exe_processes"] = exe_processes
        
        return result
    except Exception as e:
        print(f"Error getting resource usage: {e}")
        return {}



def save_to_supabase(data_to_log):
    """
    บันทึกข้อมูลลงใน Supabase resource_logs table
    """
    global current_session_id
    
    if not current_session_id:
        print("Agent: ไม่มี session_id สำหรับบันทึกข้อมูล")
        return False
    
    try:
        # ตรวจสอบว่า session_id ยังมีอยู่ใน exam_student_sessions หรือไม่
        session_check = supabase.table('exam_student_sessions').select('id, is_active').eq('id', current_session_id).execute()
        
        if not session_check.data:
            print(f"Agent: Session {current_session_id} ไม่พบใน exam_student_sessions - ข้ามการบันทึก resource logs")
            return False
            
        session = session_check.data[0]
        if not session.get('is_active', False):
            print(f"Agent: Session {current_session_id} ไม่ active - ข้ามการบันทึก resource logs")
            return False
        
        # เตรียมข้อมูลสำหรับ Supabase (เพิ่มข้อมูลใหม่แบบ test.py)
        supabase_data = {
            "session_id": current_session_id,
            "timestamp": data_to_log["timestamp"],
            "active_window_title": data_to_log["active_window_title"],
            "all_open_windows": data_to_log.get("all_open_windows", []),
            "cpu_usage": int(round(data_to_log["cpu_usage"])),
            "cpu_model": data_to_log.get("cpu_model", "Unknown"),
            "ram_usage": int(round(data_to_log["ram_usage"])),
            "ram_total_gb": round(data_to_log.get("ram_total_gb", 0), 2),
            "ram_used_gb": round(data_to_log.get("ram_used_gb", 0), 2),
            "ram_available_gb": round(data_to_log.get("ram_available_gb", 0), 2),
            "disk_partitions_info": data_to_log.get("disk_partitions_info", []),
            "network_download_mb": round(data_to_log.get("network_download_mb", 0), 2),
            "network_upload_mb": round(data_to_log.get("network_upload_mb", 0), 2),
            "exe_processes": data_to_log.get("exe_processes", [])
        }
        
        # บันทึกลง Supabase
        result = supabase.table('resource_logs').insert(supabase_data).execute()
        
        if result.data:
            print("Agent: บันทึกข้อมูลลง Supabase สำเร็จ")
            return True
        else:
            print("Agent: ไม่สามารถบันทึกข้อมูลลง Supabase ได้")
            return False
            
    except Exception as e:
        print(f"Agent: เกิดข้อผิดพลาดในการบันทึกลง Supabase: {e}")
        return False

def save_to_local_backup(data_to_log):
    """
    บันทึกข้อมูลลงไฟล์ local เป็น backup
    """
    try:
        # อ่านข้อมูลเก่าจากไฟล์
        try:
            with open(log_file, "r") as f:
                logs = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            logs = []
        
        # เพิ่มข้อมูลใหม่เข้าไป
        logs.append(data_to_log)
        
        # เขียนข้อมูลทั้งหมดกลับลงไฟล์
        with open(log_file, "w") as f:
            json.dump(logs, f, indent=4)
        
        print("Agent: บันทึกข้อมูล backup ลงใน data.json แล้ว")
        return True
        
    except Exception as e:
        print(f"Agent: เกิดข้อผิดพลาดในการบันทึก backup: {e}")
        return False

def monitor_loop():
    """
    ลูปหลักสำหรับการตรวจสอบและบันทึกข้อมูล - ดึงข้อมูลทั้งหมดพร้อมกัน
    """
    global is_monitoring_active, current_blocked_resources
    

    is_monitoring_active = True
    last_blocked_update = 0
    
    while is_monitoring_active:
        try:
            # Update blocked resources every 15 seconds
            if time.time() - last_blocked_update > 15:
                if current_session_id:
                    new_blocked_list, _ = get_blocked_resources(current_session_id, verbose=False)
                    
                    # Check if changed (Simple check: convert to string representation for comparison)
                    # Sort by id to ensure order doesn't affect comparison
                    current_str = json.dumps(sorted(current_blocked_resources, key=lambda x: x.get('id', '')), sort_keys=True)
                    new_str = json.dumps(sorted(new_blocked_list, key=lambda x: x.get('id', '')), sort_keys=True)
                    
                    if current_str != new_str:
                        print(f"\n[UPDATE] รายการ Blocked Resources มีการเปลี่ยนแปลง!")
                        print(f"   เก่า: {len(current_blocked_resources)} รายการ -> ใหม่: {len(new_blocked_list)} รายการ")
                        set_blocked_resources(new_blocked_list)
                        
                        # Show new list
                        print("   รายการใหม่:")
                        for item in new_blocked_list:
                            print(f"   - {item.get('pattern')}")
                        print("")
                        
                last_blocked_update = time.time()

            # ดึงข้อมูลทั้งหมดในครั้งเดียว (แบบ parallel)
            resources = get_resource_usage()
            
            # ตรวจสอบว่าได้ข้อมูลครบถ้วนหรือไม่
            if not resources:
                print("Warning: ไม่สามารถดึงข้อมูลได้")
                time.sleep(2)
                continue
            
            # เตรียมข้อมูลสำหรับบันทึก
            # ใช้ datetime.now().astimezone().isoformat() เพื่อส่ง Timezone Offset ไปด้วย
            # Supabase จะแปลงเป็น UTC ให้อัตโนมัติ และ Frontend จะแปลงกลับเป็น Local Time ได้ถูกต้อง
            data_to_log = {
                "timestamp": datetime.now().astimezone().isoformat(),
                "cpu_usage": float(resources.get("cpu_usage", 0.0)),
                "cpu_frequency": float(resources.get("cpu_frequency", 0.0)),
                "cpu_model": resources.get("cpu_model", "Unknown"),
                "processor_name": resources.get("processor_name", "Unknown"),
                "cpu_cores": int(resources.get("cpu_cores", 0)),
                "ram_usage": float(resources.get("ram_usage", 0.0)),
                "ram_total_gb": float(resources.get("ram_total_gb", 0.0)),
                "ram_used_gb": float(resources.get("ram_used_gb", 0.0)),
                "ram_available_gb": float(resources.get("ram_available_gb", 0.0)),
                "total_memory_gb": float(resources.get("total_memory_gb", 0.0)),
                "available_memory_gb": float(resources.get("available_memory_gb", 0.0)),
                "disk_partitions_info": resources.get("disk_partitions_info", []),
                "disk_read_kb": int(resources.get("disk_read_kb", 0)),
                "disk_write_kb": int(resources.get("disk_write_kb", 0)),
                "disk_total_gb": float(resources.get("disk_total_gb", 0.0)),
                "disk_free_gb": float(resources.get("disk_free_gb", 0.0)),
                "disk_type": resources.get("disk_type", "Unknown"),
                "gpu_usage": int(resources.get("gpu_usage", 0)),
                "gpu_model": resources.get("gpu_model", "Unknown"),
                "network_download_mb": float(resources.get("network_download_mb", 0.0)),
                "network_upload_mb": float(resources.get("network_upload_mb", 0.0)),
                "network_speed_kbps": int(resources.get("network_speed_kbps", 0)),
                "network_type": resources.get("network_type", "Unknown"),
                "active_window_title": resources.get("active_window_title", "Unknown"),
                "all_open_windows": resources.get("all_open_windows", []),
                "exe_processes": resources.get("exe_processes", [])
            }
            
            # print(f"📊 ข้อมูลที่ดึงได้: CPU={data_to_log['cpu_usage']:.1f}%, RAM={data_to_log['ram_usage']:.1f}%, Network={data_to_log['network_download_mb']:.2f}MB")
            
            # ตรวจสอบ Violation
            check_violations(resources)

            # พยายามบันทึกลง Supabase ก่อน
            supabase_success = save_to_supabase(data_to_log)
            
            # หากบันทึกลง Supabase ไม่สำเร็จ ให้บันทึกลง local backup
            if not supabase_success:
                save_to_local_backup(data_to_log)
            
        except Exception as e:
            print(f"Agent: เกิดข้อผิดพลาดในการตรวจสอบ: {e}")
        
        # หน่วงเวลา 3 วินาที (ลดลงเพื่อให้ข้อมูลอัปเดตเร็วขึ้น)
        time.sleep(3)
    


def set_session_id(session_id):
    """
    กำหนด session_id สำหรับการบันทึกข้อมูล
    """
    global current_session_id
    current_session_id = session_id


def get_current_session_id():
    """
    ดึง session_id ปัจจุบัน
    """
    return current_session_id

def log_session_start(session_id, student_email, student_name, seat_number, ip_address):
    """บันทึกข้อมูลการเริ่มต้น session ลงใน Supabase"""
    machine_id = get_machine_identifier()
    
    try:
        # ตรวจสอบว่า session_id มีอยู่ใน exam_student_sessions หรือไม่
        session_check = supabase.table('exam_student_sessions').select('id, is_active').eq('id', session_id).execute()
        
        if not session_check.data:
            print(f"Agent [{machine_id}]: Session {session_id} ไม่พบใน exam_student_sessions - ข้ามการบันทึก session start log")
            return
            
        session = session_check.data[0]
        if not session.get('is_active', False):
            print(f"Agent [{machine_id}]: Session {session_id} ไม่ active - ข้ามการบันทึก session start log")
            return
        
        log_data = {
            'session_id': session_id,
            'cpu_usage': 0,
            'ram_usage': 0,
            'active_window_title': f'Session Started - {student_name} ({student_email}) - Seat {seat_number} - IP {ip_address} - Machine {machine_id}'
        }
        
        result = supabase.table('resource_logs').insert(log_data).execute()
        print(f"Agent [{machine_id}]: บันทึกการเริ่มต้น session {session_id} ลงใน Supabase สำเร็จ")
        
    except Exception as e:
        print(f"Agent [{machine_id}]: ข้อผิดพลาดในการบันทึกการเริ่มต้น session: {e}")

def check_supabase_connection():
    """
    ตรวจสอบการเชื่อมต่อกับ Supabase
    """
    try:
        # ทดสอบการเชื่อมต่อด้วยการ query ข้อมูลจาก table ใดๆ
        result = supabase.table('exam_student_sessions').select('id').limit(1).execute()
        print("Agent: เชื่อมต่อ Supabase สำเร็จ")
        return True
    except Exception as e:
        print(f"Agent: ไม่สามารถเชื่อมต่อ Supabase ได้: {e}")
        return False

def get_machine_identifier():
    """
    สร้าง unique identifier สำหรับเครื่องนี้
    รวม IP + hostname เพื่อป้องกันการปนกันระหว่างเครื่อง
    """
    try:
        import socket
        hostname = socket.gethostname()
        local_ip = get_client_ip()
        # สร้าง unique identifier จาก IP + hostname
        machine_id = f"{local_ip}_{hostname}"
        return machine_id
    except Exception as e:
        print(f"Warning: ไม่สามารถสร้าง machine identifier ได้: {e}")
        return "unknown_machine"

def get_client_ip():
    """
    ดึง Local Network IP address ของเครื่องปัจจุบัน
    ใช้ Local IP แทน Public IP เพื่อป้องกันการปนกันของเครื่องในเครือข่ายเดียวกัน
    """
    try:
        # ใช้ local network IP เป็นหลัก (แทนการใช้ public IP)
        import socket
        
        # วิธีที่แม่นยำกว่าในการหา local IP
        # สร้าง socket connection ไปยัง external address แล้วดู local IP ที่ใช้
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        try:
            # ไม่จำเป็นต้องเชื่อมต่อจริง แค่ดู IP ที่จะใช้
            s.connect(('10.254.254.254', 1))
            local_ip = s.getsockname()[0]
        except Exception:
            local_ip = '127.0.0.1'
        finally:
            s.close()
        
        # ตรวจสอบว่าได้ IP ที่ถูกต้อง (ไม่ใช่ localhost)
        if local_ip != '127.0.0.1':
            return local_ip
            
        # Fallback: ใช้ hostname method
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        return local_ip
        
    except Exception as e:
        print(f"Warning: ไม่สามารถดึง IP address ได้: {e}")
        return "127.0.0.1"

def get_mac_address(target_ip):
    """
    ดึง MAC Address ของ Network Interface ที่ใช้ IP ที่ระบุ
    """
    try:
        interfaces = psutil.net_if_addrs()
        for interface_name, addrs in interfaces.items():
            for addr in addrs:
                if addr.family == socket.AF_INET and addr.address == target_ip:
                    # Found the interface with this IP, now look for MAC
                    for addr2 in addrs:
                        if addr2.family == psutil.AF_LINK:
                            return addr2.address
        return None
    except Exception as e:
        print(f"Error getting MAC: {e}")
        return None

def auto_update_ip_mac():
    """
    ตรวจสอบและอัปเดต IP/MAC Address ในฐานข้อมูลอัตโนมัติ
    """
    print("\n--- Auto-Updating IP/MAC Address ---")
    local_ip = get_client_ip()
    
    if local_ip == "127.0.0.1":
        print("Agent: Cannot determine local IP. Skipping auto-update.")
        return

    mac_address = get_mac_address(local_ip)
    
    if not mac_address:
        print(f"Agent: Could not determine MAC address for IP {local_ip}. Skipping auto-update.")
        return

    print(f"Agent: Current Machine -> IP: {local_ip}, MAC: {mac_address}")

    # 1. Try to find by MAC (เครื่องเคยลงทะเบียนแล้ว)
    try:
        # Note: ต้องมีคอลัมน์ 'mac_address' ในตาราง room_seat_ip_mappings
        res = supabase.table('room_seat_ip_mappings').select('*').eq('mac_address', mac_address).execute()
        
        if res.data:
            # Found by MAC -> Update IP if different
            mapping = res.data[0]
            if mapping['ip_address'] != local_ip:
                print(f"Agent: Found registered MAC. Updating IP for Seat {mapping['seat_number']} (Row {mapping['row_number']}, Col {mapping['column_number']})")
                print(f"       Old IP: {mapping['ip_address']} -> New IP: {local_ip}")
                
                update_res = supabase.table('room_seat_ip_mappings').update({'ip_address': local_ip, 'updated_at': datetime.now().astimezone().isoformat()}).eq('id', mapping['id']).execute()
                
                if update_res.data:
                    print("Agent: Update IP successful.")
                else:
                    print(f"Agent: Update IP failed. Response: {update_res}")
            else:
                print(f"Agent: Machine is already registered correctly at Seat {mapping['seat_number']}. IP matches.")
            return
    except Exception as e:
        print(f"Agent: Error checking MAC in DB: {e}")
        # อาจจะ error ถ้าไม่มีคอลัมน์ mac_address หรือตารางไม่ถูกต้อง
        return

    # 2. If not found by MAC, try to find by IP (First time setup / Binding)
    try:
        print("Agent: MAC not found in DB. Checking by IP for first-time binding...")
        res = supabase.table('room_seat_ip_mappings').select('*').eq('ip_address', local_ip).execute()
        
        if res.data:
            # Found by IP -> Check if MAC is empty
            # ถ้าเจอหลาย record (ซึ่งไม่ควรเกิดขึ้นถ้า IP unique) เอาอันแรก
            for mapping in res.data:
                current_mac = mapping.get('mac_address')
                if not current_mac or current_mac.strip() == "":
                    print(f"Agent: Found IP {local_ip} at Seat {mapping['seat_number']}. Binding MAC {mac_address} to this seat.")
                    
                    update_res = supabase.table('room_seat_ip_mappings').update({'mac_address': mac_address, 'updated_at': datetime.now().astimezone().isoformat()}).eq('id', mapping['id']).execute()
                    
                    if update_res.data:
                        print("Agent: Binding MAC successful.")
                    else:
                        print(f"Agent: Binding MAC failed. Response: {update_res}")
                    return
                else:
                    print(f"Agent: Found IP {local_ip} at Seat {mapping['seat_number']}, but it is already bound to MAC {current_mac}.")
                    print("       Skipping to prevent conflict. Please ask teacher to reset MAC for this seat if needed.")
        else:
            print(f"Agent: IP {local_ip} not found in any seat mapping.")
            print("       Please ask teacher to map this IP to a seat first.")
            
    except Exception as e:
        print(f"Agent: Error checking IP in DB: {e}")
    
    print("------------------------------------\n")

def get_blocked_resources(session_id, verbose=True):
    """
    ดึงรายการทรัพยากรที่ถูกบล็อกสำหรับ session นี้
    """
    try:
        if verbose:
            print(f"\n--- Fetching Blocked Resources for Session {session_id} ---")
        
        # 1. ดึง layout_id จาก session
        session_res = supabase.table('exam_student_sessions').select('layout_id').eq('id', session_id).execute()
        if not session_res.data:
            if verbose: print("Agent: ไม่พบข้อมูล Session")
            return [], "Unknown"
        layout_id = session_res.data[0]['layout_id']
        
        # 2. ดึง room_name จาก layout
        layout_res = supabase.table('room_seat_layouts').select('room_name').eq('id', layout_id).execute()
        if not layout_res.data:
            if verbose: print("Agent: ไม่พบข้อมูล Layout")
            return [], "Unknown"
        room_name = layout_res.data[0]['room_name']
        if verbose: print(f"Agent: Room Name = {room_name}")
        
        # 3. ดึง active exam_room โดยใช้ room_name
        room_res = supabase.table('exam_rooms').select('id').eq('room_name', room_name).eq('is_active', True).execute()
        
        if not room_res.data:
            if verbose: print(f"Agent: ไม่พบ Exam Room ที่ Active สำหรับห้อง {room_name}")
            return [], room_name
            
        exam_room_ids = [r['id'] for r in room_res.data]
        
        # 4. ดึง blocked resources
        blocked_res = supabase.table('room_blocked_resources').select('*').in_('room_id', exam_room_ids).execute()
        
        if verbose:
            if blocked_res.data:
                print(f"Agent: พบ Blocked Resources จำนวน {len(blocked_res.data)} รายการ:")
                print("==================================================")
                for item in blocked_res.data:
                    print(f"  - [{item.get('match_type', 'contains')}] {item.get('pattern')}")
                print("==================================================\n")
            else:
                print("Agent: ไม่พบรายการ Blocked Resources")
                print("==================================================\n")
            
        return blocked_res.data, room_name
        
    except Exception as e:
        print(f"Agent: Error fetching blocked resources: {e}")
        return [], "Unknown"

def listen_for_session_commands():
    """
    ฟังคำสั่งจาก Supabase เพื่อเริ่ม/หยุดการตรวจสอบ
    ใช้ machine identifier เพื่อป้องกันการปนกันระหว่างเครื่อง
    """
    global is_monitoring_active
    

    
    # ดึง machine identifier ของเครื่องนี้
    machine_id = get_machine_identifier()
    local_ip = get_client_ip()

    
    # เริ่มต้นด้วยเวลาที่ผ่านมา 5 นาทีเพื่อตรวจจับ session ที่อาจพลาด
    from datetime import timedelta
    last_check_time = datetime.now() - timedelta(minutes=5)
    
    try:
        while True:
            try:
                # ตรวจสอบ session ใหม่ที่ active และมี IP ตรงกับเครื่องนี้
                current_time = datetime.now()
                
                # ดึงข้อมูล session ที่ active และตรง IP
                result = supabase.table('exam_student_sessions').select('*').eq('ip_address', local_ip).eq('is_active', True).execute()
                

                
                for session in result.data:
                    session_ip = session.get('ip_address')
                    session_id = session['id']
                    

                    
                    # ตรวจสอบว่า IP ตรงกับเครื่องนี้และยังไม่ได้เริ่มการตรวจสอบ
                    if session_ip == local_ip and current_session_id != session_id and not is_monitoring_active:
                        student_email = session.get('student_email', 'Unknown')
                        student_name = session.get('student_name', 'Unknown')
                        seat_number = session.get('seat_number', 'Unknown')
                        

                        
                        # บันทึกข้อมูลการเริ่มต้น session ลงใน resource_logs
                        log_session_start(session_id, student_email, student_name, seat_number, session_ip)
                        
                        # กำหนด session_id และเริ่มการตรวจสอบ
                        set_session_id(session_id)
                        
                        # ดึงและแสดงรายการ Blocked Resources
                        blocked_list, room_name = get_blocked_resources(session_id)
                        set_blocked_resources(blocked_list)
                        
                        # เก็บข้อมูล Session Info
                        set_session_info({
                            "student_name": student_name,
                            "student_email": student_email,
                            "seat_number": seat_number,
                            "room_name": room_name,
                            "session_id": session_id
                        })

                        # เริ่มการตรวจสอบในเธรดแยก
                        monitoring_thread = threading.Thread(target=start_monitoring)
                        monitoring_thread.daemon = True
                        monitoring_thread.start()
                        
                        break
                
                # ตรวจสอบว่า session ปัจจุบันถูกปิดหรือไม่
                if current_session_id and is_monitoring_active:
                    session_result = supabase.table('exam_student_sessions').select('*').eq('id', current_session_id).execute()
                    
                    if session_result.data:
                        session = session_result.data[0]
                        # ตรวจสอบว่า session ถูกปิดหรือไม่
                        if not session.get('is_active', True) or session.get('session_end_time') is not None:
                            print(f"Agent [{machine_id}]: Session {current_session_id} ถูกปิด - หยุดการตรวจสอบทรัพยากร")
                            stop_monitoring()
                    else:
                        # ถ้าไม่พบ session ปัจจุบันในฐานข้อมูล แสดงว่าถูกลบแล้ว

                        stop_monitoring()
                
                last_check_time = current_time
                time.sleep(10)  # ตรวจสอบทุก 10 วินาที
                
            except Exception as e:
                print(f"Agent [{machine_id}]: เกิดข้อผิดพลาดในการตรวจสอบ session: {e}")
                time.sleep(10)
                
    except KeyboardInterrupt:
        print(f"\nAgent [{machine_id}]: หยุดการฟังคำสั่งจาก Supabase")
    except Exception as e:
        print(f"Agent [{machine_id}]: เกิดข้อผิดพลาดร้าายแรงในการฟังคำสั่ง: {e}")



def start_flask_server():
    """
    เริ่ม Flask server
    """
    app.run(host='localhost', port=5001, debug=False, threaded=True, use_reloader=False)

def start_agent_service():
    """
    เริ่มบริการ Agent สำหรับฟังคำสั่งจาก Supabase
    """
    machine_id = get_machine_identifier()
    local_ip = get_client_ip()

    print(f"\n==================================================")
    print(f"   Current Machine IP Address: {local_ip}")
    print(f"==================================================\n")
    
    # ตรวจสอบการเชื่อมต่อ
    if not check_supabase_connection():
        print(f"Agent [{machine_id}]: ไม่สามารถเชื่อมต่อ Supabase ได้ - หยุดการทำงาน")
        return
    
    # เริ่ม Flask server ในเธรดแยก
    flask_thread = threading.Thread(target=start_flask_server)
    flask_thread.daemon = True
    flask_thread.start()
    
    # รอให้ Flask server เริ่มทำงาน
    time.sleep(2)

    
    # เริ่มฟังคำสั่งจาก Supabase ในเธรดแยก
    session_listener_thread = threading.Thread(target=listen_for_session_commands)
    session_listener_thread.daemon = True
    session_listener_thread.start()

    print(f"Agent [{machine_id}]: กำลังรอคำสั่ง Session จาก Supabase (IP: {local_ip})...")
    
    # รักษาการทำงานของ Agent
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:

        stop_monitoring()

def debug_check_blocked_resources():
    """
    ฟังก์ชันทดสอบ: ดึงข้อมูลจากตาราง room_blocked_resources มาแสดง
    เพื่อให้แน่ใจว่าสามารถดึงข้อมูลได้จริง
    """
    try:
        print("\n[DEBUG] Testing connection to room_blocked_resources...")
        response = supabase.table('room_blocked_resources').select('*').limit(5).execute()
        
        if response.data:
            print(f"[DEBUG] Success! Found {len(response.data)} rules in database (showing max 5):")
            for item in response.data:
                print(f"  - ID: {item['id']}, Pattern: {item['pattern']}, Type: {item['match_type']}")
        else:
            print("[DEBUG] Connection successful, but table 'room_blocked_resources' is empty.")
            
        print("[DEBUG] Test complete.\n")
    except Exception as e:
        print(f"[DEBUG] Error fetching blocked resources: {e}\n")

if __name__ == "__main__":
    # === เริ่มบริการ Agent ===
    
    # ทดสอบดึงข้อมูล Blocked Resources ทันทีที่รัน
    debug_check_blocked_resources()

    # Auto-Update IP/MAC Address
    auto_update_ip_mac()

    # เริ่มบริการ Agent สำหรับฟังคำสั่งจาก Supabase
    start_agent_service()