import os
import threading
import subprocess
import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime

# NAME OF THE LOCAL BACKEND FILE WE'LL CREATE NEXT
BACKEND_FILE = "local_backend_server.py"   # <-- keep this name (we'll create it in the next step)

# log file placed next to this script
LOG_FILE = os.path.join(os.path.dirname(__file__), "backend_run.log")

class BackendGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("VanguardEscrow — Backend Launcher")
        self.root.geometry("520x420")
        self.root.configure(bg="#0f1720")

        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TLabel", background="#0f1720", foreground="white", font=("Segoe UI", 10))
        style.configure("TButton", font=("Segoe UI", 10, "bold"), padding=6)

        ttk.Label(root, text="Backend Control Panel", font=("Segoe UI", 14)).pack(pady=12)

        btn_frame = ttk.Frame(root)
        btn_frame.pack(pady=6)

        ttk.Button(btn_frame, text="▶ Start Backend", command=self.start_backend).grid(row=0, column=0, padx=6)
        ttk.Button(btn_frame, text="■ Stop Backend", command=self.stop_backend).grid(row=0, column=1, padx=6)
        ttk.Button(btn_frame, text="📜 Open Log", command=self.open_log).grid(row=0, column=2, padx=6)

        ttk.Label(root, text="Live log output:", font=("Segoe UI", 10)).pack(pady=(12,6))
        self.log_box = tk.Text(root, height=14, width=70, bg="#0b1220", fg="#e6f0ff", insertbackground="white")
        self.log_box.pack(padx=10, pady=4)

        self.process = None
        self._tailing = False

    def start_backend(self):
        # if already running
        if self.process and self.process.poll() is None:
            messagebox.showinfo("Info", "Backend already running.")
            return

        backend_path = os.path.join(os.path.dirname(__file__), BACKEND_FILE)
        if not os.path.exists(backend_path):
            messagebox.showerror("Error", f"Backend file not found:\n{backend_path}\n\nWe'll create this next.")
            return

        # start backend process and write output to log file
        def run_proc():
            with open(LOG_FILE, "a", encoding="utf-8") as lf:
                lf.write(f"\n[{datetime.now().isoformat()}] Starting backend: {BACKEND_FILE}\n")
                # spawn python running the backend file
                self.process = subprocess.Popen(
                    ["python", backend_path],
                    stdout=lf,
                    stderr=subprocess.STDOUT,
                    text=True
                )
            # start tailing the log into the GUI
            if not self._tailing:
                self._tailing = True
                threading.Thread(target=self._tail_log_to_widget, daemon=True).start()

        threading.Thread(target=run_proc, daemon=True).start()
        self.log("✅ Starting backend... (this may take a second)")

    def stop_backend(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            self.log("🟥 Sent terminate to backend process.")
        else:
            self.log("ℹ No backend process running.")

    def open_log(self):
        if os.path.exists(LOG_FILE):
            os.startfile(LOG_FILE)
        else:
            messagebox.showinfo("No log yet", "Log file not created yet.")

    def log(self, text):
        ts = datetime.now().strftime("[%Y-%m-%d %H:%M:%S]")
        line = f"{ts} {text}"
        try:
            with open(LOG_FILE, "a", encoding="utf-8") as lf:
                lf.write(line + "\n")
        except Exception:
            pass
        self.log_box.insert(tk.END, line + "\n")
        self.log_box.see(tk.END)
        self.root.update_idletasks()

    def _tail_log_to_widget(self):
        # simple file-tail: read appended lines and push to text widget
        try:
            with open(LOG_FILE, "r", encoding="utf-8", errors="ignore") as lf:
                # go to EOF
                lf.seek(0, os.SEEK_END)
                while True:
                    where = lf.tell()
                    line = lf.readline()
                    if not line:
                        lf.seek(where)
                        if self.process and self.process.poll() is not None:
                            # process ended, drain remaining output then stop
                            remaining = lf.read()
                            if remaining:
                                self.log_box.insert(tk.END, remaining + "\n")
                            break
                        # sleep briefly
                        import time
                        time.sleep(0.4)
                        continue
                    # push to widget
                    self.log_box.insert(tk.END, line)
                    self.log_box.see(tk.END)
        except FileNotFoundError:
            pass
        finally:
            self._tailing = False

if __name__ == "__main__":
    root = tk.Tk()
    app = BackendGUI(root)
    root.mainloop()
