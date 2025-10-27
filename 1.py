import tkinter as tk
from tkinter import scrolledtext, messagebox
import subprocess
import threading
import os
import sys

# --- Configuration ---
# NOTE: Reverting to '--create-site' flag to ensure the site can be recreated 
# after the user deletes the old projects in the Netlify dashboard.
NETLIFY_DEPLOY_COMMAND = "netlify deploy --prod --create-site"
# The working directory is set to the folder where the script is run.
WORKING_DIR = os.getcwd()

class NetlifyDeployerApp:
    def __init__(self, master):
        self.master = master
        master.title("Netlify CLI Deployer")
        master.geometry("800x600")
        master.configure(bg="#f4f7f9")
        
        # Check for Netlify CLI presence
        if not self._check_netlify_cli():
            messagebox.showerror(
                "Error", 
                "Netlify CLI not found.\nPlease install it globally: 'npm install netlify-cli -g'"
            )
            self._setup_error_ui()
            return

        # --- UI Elements ---
        self._setup_success_ui(master)

    def _setup_error_ui(self):
        """Sets up a minimal UI indicating an installation error."""
        error_frame = tk.Frame(self.master, bg="#f472b6", padx=20, pady=40)
        error_frame.pack(fill='both', expand=True)
        tk.Label(
            error_frame, 
            text="❌ NETLIFY CLI IS MISSING ❌", 
            fg="white", 
            bg="#f472b6",
            font=("Inter", 20, "bold")
        ).pack(pady=10)
        tk.Label(
            error_frame, 
            text="Please run 'npm install netlify-cli -g' in your terminal and restart this script.", 
            fg="white", 
            bg="#f472b6",
            font=("Inter", 12)
        ).pack(pady=10)


    def _setup_success_ui(self, master):
        """Sets up the full application UI."""
        # 1. Header Frame
        header_frame = tk.Frame(master, bg="#3b82f6", padx=20, pady=10)
        header_frame.pack(fill='x')
        
        header_label = tk.Label(
            header_frame, 
            text="Netlify Deploy Tool", 
            fg="white", 
            bg="#3b82f6",
            font=("Inter", 18, "bold")
        )
        header_label.pack(side='left')

        # 2. Main Frame
        main_frame = tk.Frame(master, bg="#f4f7f9", padx=20, pady=20)
        main_frame.pack(fill='both', expand=True)

        # Deployment Status Label
        self.status_label = tk.Label(
            main_frame, 
            text=f"Ready to Deploy: Running in {WORKING_DIR}", 
            bg="#f4f7f9", 
            fg="#1e40af", 
            font=("Inter", 10, "italic")
        )
        self.status_label.pack(fill='x', pady=(0, 10))

        # Output Log Area
        self.log_area = scrolledtext.ScrolledText(
            main_frame, 
            wrap=tk.WORD, 
            font=("Consolas", 10),
            bg="#ffffff",
            fg="#333333",
            relief=tk.FLAT,
            borderwidth=1,
            highlightbackground="#e0e7ff",
            highlightcolor="#a5b4fc",
            highlightthickness=1
        )
        self.log_area.pack(fill='both', expand=True)
        self.log_area.config(state=tk.DISABLED) # Make read-only

        # Initial instruction message
        initial_message = (
            "--- New Site Creation Required ---\n"
            f"This script will run: '{NETLIFY_DEPLOY_COMMAND}'\n"
            "This will create a brand new Netlify site and ask you to link your custom domain.\n"
            "Click the button below to start the new setup."
        )
        self.log_message(initial_message, "info")

        # 3. Button Frame
        button_frame = tk.Frame(master, bg="#f4f7f9", padx=20, pady=15)
        button_frame.pack(fill='x')

        # Deploy Button
        self.deploy_button = tk.Button(
            button_frame, 
            text="🚀 START NEW DEPLOYMENT SETUP", 
            command=self.start_deployment_thread,
            bg="#10b981", # Tailwind green-500
            fg="white",
            activebackground="#059669", # Tailwind green-600
            activeforeground="white",
            relief=tk.RAISED,
            bd=0,
            font=("Inter", 12, "bold"),
            cursor="hand2",
            padx=15,
            pady=8
        )
        self.deploy_button.pack(side='right')

        # Styling improvement for button hover/click (simple binding)
        self.deploy_button.bind("<Enter>", lambda e: self.deploy_button.config(bg="#059669"))
        self.deploy_button.bind("<Leave>", lambda e: self.deploy_button.config(bg="#10b981"))


    def _check_netlify_cli(self):
        """Checks if the netlify command is available."""
        # Check explicitly for Windows and use shell=True for reliable path lookup
        is_windows = sys.platform == "win32"
        try:
            # Check a basic Netlify command
            subprocess.run(
                ["netlify", "--version"], 
                check=True, 
                capture_output=True, 
                timeout=5, 
                shell=is_windows # <--- ADDED SHELL=TRUE HERE
            )
            return True
        except (subprocess.CalledProcessError, FileNotFoundError, TimeoutError):
            return False
            
    def log_message(self, message, color="black"):
        """Inserts a message into the log area and scrolls to the end."""
        self.log_area.config(state=tk.NORMAL)
        self.log_area.insert(tk.END, message + "\n", color)
        self.log_area.see(tk.END)
        self.log_area.config(state=tk.DISABLED)
        
        # Define tags for coloring
        self.log_area.tag_config('green', foreground='#16a34a') # Success
        self.log_area.tag_config('red', foreground='#ef4444')   # Error
        self.log_area.tag_config('info', foreground='#1e40af')  # Info/Instruction

    def start_deployment_thread(self):
        """Starts the deployment process in a separate thread to keep the GUI responsive."""
        # Disable button and update status while running
        self.deploy_button.config(state=tk.DISABLED, text="Deploying... Please wait...")
        self.status_label.config(text="Deployment in progress (DO NOT CLOSE WINDOW)...", fg="#f59e0b")
        self.log_area.config(state=tk.NORMAL)
        self.log_area.delete('1.0', tk.END)
        self.log_area.config(state=tk.DISABLED)
        self.log_message(f"--- Starting Deployment: {NETLIFY_DEPLOY_COMMAND} ---", "info")
        
        # Start the deployment in a background thread
        deployment_thread = threading.Thread(target=self.run_deployment)
        deployment_thread.daemon = True # Allows thread to close when main window closes
        deployment_thread.start()

    def run_deployment(self):
        """Executes the Netlify deployment command."""
        try:
            # Use Popen to execute the command and capture output in real-time
            # Note: We must include the check for Windows (sys.platform == "win32") 
            # and set shell=True if needed for Popen to find the globally installed npm commands.
            is_windows = sys.platform == "win32"
            
            process = subprocess.Popen(
                NETLIFY_DEPLOY_COMMAND,
                cwd=WORKING_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, # Merge stderr into stdout for easier logging
                text=True,
                bufsize=1,
                shell=is_windows # Use shell=True on Windows to find global executables reliably
            )

            # Read output line by line and update the GUI log
            while True:
                line = process.stdout.readline()
                if not line:
                    break
                self.master.after(0, lambda l=line: self._process_output_line(l))
            
            # Wait for the process to finish and get the return code
            process.wait()

            if process.returncode == 0:
                final_status = "✅ DEPLOYMENT SUCCESSFUL! You can now run the API tester."
                self.log_message("\n" + final_status, "green")
                self.status_label.config(text=final_status, fg="#16a34a")
            else:
                final_status = f"❌ DEPLOYMENT FAILED with exit code {process.returncode}. Review the logs above."
                self.log_message("\n" + final_status, "red")
                self.status_label.config(text=final_status, fg="#ef4444")

        except Exception as e:
            final_status = f"CRITICAL ERROR EXECUTING SCRIPT: {e}"
            self.log_message("\n" + final_status, "red")
            self.status_label.config(text=final_status, fg="#ef4444")

        # Re-enable the button regardless of success/failure
        self.master.after(0, lambda: self.deploy_button.config(state=tk.NORMAL, text="🚀 START NEW DEPLOYMENT SETUP"))

    def _process_output_line(self, line):
        """Colors and inserts a single line of output."""
        stripped_line = line.strip()
        color = "black"
        
        if "Deployment failed" in stripped_line or "Error" in stripped_line or "504 Gateway Time-out" in stripped_line or "error" in stripped_line.lower():
            color = "red"
        elif "Deployment succeeded" in stripped_line or "Finished" in stripped_line or "Ready to Deploy" in stripped_line or "success" in stripped_line.lower() or "published" in stripped_line.lower():
            color = "green"

        self.log_message(stripped_line, color)


if __name__ == "__main__":
    # Add Inter font configuration (assuming a modern OS)
    try:
        root = tk.Tk()
        root.tk.call('font', 'create', 'Inter', '-family', 'Inter', '-size', 10)
    except tk.TclError:
        print("Inter font not available, using default.")
    
    app = NetlifyDeployerApp(root)
    root.mainloop()
