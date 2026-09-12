# NSU RDS Offered Courses Scraper & Browser Extension

A complete toolkit to scrape, filter, monitor seat availability, and export course tables from North South University's RDS portal:  
🔗 **`https://rds4.northsouth.ac.bd/offered_courses`**

---

## 🚀 Two Ways to Use

1. [**Chrome Browser Extension (Recommended for Students)**](#1-chrome-browser-extension):
   - **In-Page Floating Toolbar**: Injected directly onto the RDS page above the table.
   - **Multi-Filter**: Filter multiple courses (e.g. `CSE115, MAT120, ENG102`) and faculties (e.g. `NvA, Shaifur`) simultaneously.
   - **⭐ Routine & Schedule Builder**: Shortlist courses, eliminate time clashes, and view your routine on a visual weekly calendar grid (Sunday through Saturday).
   - **🎓 Avoid Same-Day Finals**: 1-click toggle to eliminate combinations where 2 classes have final exams on the same day (due to 1-slot gaps on the same day).
   - **Open Seats Only**: 1-click toggle to show sections with available seats (`> 0`).
   - **Data Export**: 1-click **Export to CSV** or **Copy TSV** (paste directly into Excel / Google Sheets).
   - **Popup Mode**: Quick course lookup & 1-click routine launch from any browser tab.

2. [**Python Scraper & Schedule Builder CLI**](#2-python-scraper--cli):
   - `scheduler.py`: Dedicated clash-free routine generator with visual weekly terminal calendar!
   - `scraper.py`: Fast command-line scraper with colorized terminal output and multi-filtering.
   - Python modules for programmatic advising analysis.
   - Export to CSV, Excel (`.xlsx`), and JSON.

---

## 1. Chrome Browser Extension

### 📥 How to Install in Chrome / Edge / Brave

1. Open your browser and navigate to:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
2. Turn on **Developer mode** (toggle switch in top-right corner).
3. Click the **"Load unpacked"** button.
4. Select the extension directory:
   ```
   d:\VSCODE\Table Scrapper\extension
   ```
5. The **NSU Course Scraper & Filter** extension is now installed! Pin it to your toolbar for easy access.

### 🎯 Features & Usage

#### A. In-Page Controls (Directly on RDS)
When you visit `https://rds4.northsouth.ac.bd/offered_courses`:
- A sleek control panel is automatically added directly above the course table.
- **Filter Course(s)**: Type one or more courses separated by commas or spaces (`CSE115, MAT120`). Quick chip buttons for popular courses are also available.
- **Filter Faculty**: Type faculty initials/names (`NvA, Shaifur, ARM`).
- **Available Seats Only**: Filters out full sections with zero seats.
- **Include Labs**: Automatically matches both theory and corresponding lab sections (e.g., searching `CSE115` shows both `CSE115` and `CSE115L`).
- **Export CSV**: Downloads the currently filtered rows with clean formatting.
- **Copy TSV**: Copies tab-delimited text ready to paste directly into a spreadsheet.
- **Auto-Save Filters**: Remembers your filter inputs across page reloads (helpful because RDS refreshes every 6 minutes!).

#### B. Toolbar Popup
- Click the extension icon in your browser toolbar anytime to search courses, preview seats, or jump to the RDS tab.

---

## ⚡ Sharing with Friends & Real-Time Auto-Sync

You can share this extension with your friends so that **any new features you add update on their computers and yours in real-time**!

### 📤 For the Developer (How to Publish Updates)
Whenever you add a new feature or fix a bug:
1. Double-click **`publish.bat`** in the root directory.
2. Enter an optional commit message (or press Enter).
3. The script commits and pushes your code directly to GitHub.
4. All friends running AutoSync will receive your new code automatically within 30-60 seconds!

### 👥 For Your Friends (How to Install & Auto-Sync)
Share the `for_friends` folder (or send them `Setup_NSU_Extension.bat`):

1. **1-Click Install**:
   - Double-click **`Setup_NSU_Extension.bat`**.
   - It downloads the latest extension directly to their `Desktop\NSU_Course_Extension` and opens `chrome://extensions`.
2. **Load into Chrome**:
   - Enable **Developer mode** (top right switch).
   - Click **Load unpacked** and select `Desktop\NSU_Course_Extension`.
3. **Real-Time AutoSync**:
   - Keep **`AutoSync_NSU_Extension.bat`** (placed on their Desktop) open/minimized.
   - It continuously checks for updates in the background.
   - When you push new features, their extension automatically updates.
   - On the RDS page, an **"Update Available (vX.X) [🔄 Reload Extension]"** banner appears—one click applies the changes instantly!
4. **Manual Update**:
   - They can also double-click **`Update_NSU_Extension.bat`** anytime to pull the newest version.

---

## 2. Python Scraper & CLI

### 📦 Setup & Requirements

```bash
cd "d:\VSCODE\Table Scrapper\python"
pip install -r requirements.txt
```

### 💻 Command-Line Usage

#### Filter by Course Code(s):
```bash
python scraper.py -c CSE115 MAT120 ENG102
```

#### Filter by Faculty Initial(s):
```bash
python scraper.py -f NvA Shaifur ARM
```

#### Filter by Course AND Faculty:
```bash
python scraper.py -c CSE115 -f NvA
```

#### Only Show Sections with Open Seats:
```bash
python scraper.py -c CSE115 MAT120 --open-only
```

#### Export to CSV, Excel, or JSON:
```bash
# Export to CSV
python scraper.py -c CSE115 -o cse115_sections.csv

# Export to Excel
python scraper.py -c CSE115 -o cse115_sections.xlsx

# Export to JSON
python scraper.py -c CSE115 -o cse115_sections.json
```

#### Interactive Guided Mode:
If you run `scraper.py` without arguments, it launches an interactive prompt:
```bash
python scraper.py
```

---

### 🗓️ Clash-Free Schedule Generator (`scheduler.py`)

Generate valid class routines with **zero time conflicts** from shortlisted courses. Supports faculty-locking and section-locking:

```bash
# Generate routines locking to multiple specific sections (paired labs auto-pair):
python scheduler.py -c "CSE115:NvA:1,3" "MAT120:MNA:2,4" "ENG102" --open-only

# Avoid same-day final exams (no 1-slot gaps on the same day):
python scheduler.py -c "CSE115" "MAT120" "ENG102" --no-same-day-finals

# Generate routines locking to a single section:
python scheduler.py -c "CSE115:NvA:1"

# Generate routines considering all sections of preferred faculty:
python scheduler.py -c "CSE115:NvA" "MAT120:LSA" -n 5

# Interactive guided schedule builder:
python scheduler.py
```

---

## 🐍 Python API Usage

You can import `NSUCourseScraper` in your own Python scripts:

```python
from scraper import NSUCourseScraper

# Initialize and fetch live data
scraper = NSUCourseScraper()
scraper.fetch()

# Filter courses
df = scraper.filter(
    courses=["CSE115", "MAT120"],
    faculties=["NvA"],
    open_only=True,
    include_labs=True
)

# Display formatted table in terminal
scraper.display()

# Export results
scraper.export("my_filtered_courses.xlsx")

# Access as pandas DataFrame
print(df[["Course", "Section", "Faculty", "Time", "Seats"]])
```

---

## 📁 Project Structure

```
Table Scrapper/
├── extension/                   # Manifest V3 Chrome Extension
│   ├── manifest.json            # Extension configuration
│   ├── icons/                   # 16x16, 48x48, 128x128 icons
│   │   ├── icon-16.png
│   │   ├── icon-48.png
│   │   └── icon-128.png
│   ├── content/
│   │   ├── inpage.js            # In-page DataTables filter & controls
│   │   ├── bridge.js            # Isolated-world messaging bridge
│   │   └── content.css          # In-page UI styling & badges
│   └── popup/
│       ├── popup.html           # Toolbar popup interface
│       ├── popup.js             # Standalone & sync popup script
│       └── popup.css            # Popup styling
├── python/                      # Standalone Python Scraper & CLI
│   ├── scraper.py               # Scraper, CLI & interactive mode
│   ├── requirements.txt         # Python dependencies
│   └── example_usage.py         # Programmatic usage example
└── README.md                    # Documentation
```

