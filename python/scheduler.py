#!/usr/bin/env python3
"""
NSU Course Schedule Builder & Clash Detector
Generates conflict-free class schedules from shortlisted courses.
"""

import argparse
import os
import re
import sys
from dataclasses import dataclass
from typing import Dict, List, Optional, Set, Tuple

import pandas as pd
from scraper import NSUCourseScraper, Fore, Style

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DAY_NAMES = {
    "S": "Sunday",
    "M": "Monday",
    "T": "Tuesday",
    "W": "Wednesday",
    "R": "Thursday",
    "F": "Friday",
    "A": "Saturday"
}

DAYS_ORDER = ["S", "M", "T", "W", "R", "A"]


@dataclass(frozen=True)
class TimeSlot:
    day: str           # 'S', 'M', 'T', 'W', 'R', 'A'
    start_min: int     # minutes from 00:00 (e.g. 480 for 08:00 AM)
    end_min: int       # minutes from 00:00 (e.g. 570 for 09:30 AM)
    raw_time: str      # e.g. "08:00 AM - 09:30 AM"

    def overlaps_with(self, other: "TimeSlot") -> bool:
        """Returns True if two slots are on the same day and have overlapping time intervals."""
        if self.day != other.day:
            return False
        # Overlap condition: startA < endB and startB < endA
        return self.start_min < other.end_min and other.start_min < self.end_min


def parse_time_to_slots(time_str: str) -> List[TimeSlot]:
    """Parses NSU time format like 'MW 04:20 PM - 05:50 PM' into TimeSlot objects."""
    if not time_str or time_str.strip().upper() == "TBA":
        return []

    # Pattern: Days + StartTime - EndTime
    m = re.match(
        r"^([A-Za-z]+)\s+(\d{1,2}):(\d{2})\s*([AP]M)\s*-\s*(\d{1,2}):(\d{2})\s*([AP]M)",
        time_str.strip(),
        re.IGNORECASE
    )
    if not m:
        return []

    days_str, sh_s, sm_s, sp, eh_s, em_s, ep = m.groups()
    days = [d for d in days_str.upper() if d in "SMTWRFA"]

    # Convert start time to minutes
    sh, sm = int(sh_s), int(sm_s)
    sp = sp.upper()
    if sp == "PM" and sh != 12:
        sh += 12
    elif sp == "AM" and sh == 12:
        sh = 0
    start_min = sh * 60 + sm

    # Convert end time to minutes
    eh, em = int(eh_s), int(em_s)
    ep = ep.upper()
    if ep == "PM" and eh != 12:
        eh += 12
    elif ep == "AM" and eh == 12:
        eh = 0
    end_min = eh * 60 + em

    raw_interval = f"{sh_s.zfill(2)}:{sm_s} {sp} - {eh_s.zfill(2)}:{em_s} {ep}"
    return [TimeSlot(day=d, start_min=start_min, end_min=end_min, raw_time=raw_interval) for d in days]


def sections_clash(secA: Dict, secB: Dict) -> bool:
    """Returns True if secA and secB have any overlapping time slot."""
    slotsA = secA.get("_slots")
    if slotsA is None:
        slotsA = parse_time_to_slots(secA.get("Time", ""))
        secA["_slots"] = slotsA

    slotsB = secB.get("_slots")
    if slotsB is None:
        slotsB = parse_time_to_slots(secB.get("Time", ""))
        secB["_slots"] = slotsB

    for slotA in slotsA:
        for slotB in slotsB:
            if slotA.overlaps_with(slotB):
                return True
    return False


def is_lab_course(course_code: str) -> bool:
    """Returns True if the course is a lab (e.g. ends with 'L')."""
    clean = course_code.strip().upper()
    return clean.endswith("L") or clean.endswith("LAB")


def get_final_exam_day_key(section: Dict) -> Optional[str]:
    """
    Computes the final exam day identifier for a theory course section at NSU.
    NSU schedules final exams based on meeting days (ST/RA vs MW) and time slot parity.
    - Slot 1 (08:00 - 09:30), Slot 3 (11:20 - 12:50), Slot 5 (02:40 - 04:10) -> ODD parity
    - Slot 2 (09:40 - 11:10), Slot 4 (01:00 - 02:30), Slot 6 (04:20 - 05:50) -> EVEN parity
    Classes on the same day group with 1-slot gaps have the same parity and thus share the SAME final exam day.
    Labs do not participate in finals week written exams.
    """
    course = section.get("Course", "").strip().upper()
    if is_lab_course(course):
        return None

    time_str = section.get("Time", "").strip()
    if not time_str or time_str.upper() == "TBA":
        return None

    slots = section.get("_slots")
    if slots is None:
        slots = parse_time_to_slots(time_str)
        section["_slots"] = slots

    if not slots:
        return None

    # Determine day group
    days = set(s.day for s in slots)
    if "S" in days and "T" in days:
        day_group = "ST"
    elif "R" in days and "A" in days:
        day_group = "ST"  # Treat RA / ST as standard 2-day cluster
    elif "M" in days and "W" in days:
        day_group = "MW"
    elif "S" in days:
        day_group = "S"
    elif "M" in days:
        day_group = "M"
    elif "T" in days:
        day_group = "T"
    elif "W" in days:
        day_group = "W"
    elif "R" in days:
        day_group = "R"
    elif "A" in days:
        day_group = "A"
    else:
        day_group = "".join(sorted(days))

    first_slot = slots[0]
    start_min = first_slot.start_min  # minutes from 00:00

    # Match standard NSU slots
    if 450 <= start_min <= 540:       # ~08:00 AM (Slot 1)
        parity = "ODD"
    elif 550 <= start_min <= 640:     # ~09:40 AM (Slot 2)
        parity = "EVEN"
    elif 650 <= start_min <= 740:     # ~11:20 AM (Slot 3)
        parity = "ODD"
    elif 750 <= start_min <= 840:     # ~01:00 PM (Slot 4)
        parity = "EVEN"
    elif 850 <= start_min <= 940:     # ~02:40 PM (Slot 5)
        parity = "ODD"
    elif 950 <= start_min <= 1040:    # ~04:20 PM (Slot 6)
        parity = "EVEN"
    elif 1050 <= start_min <= 1140:   # ~06:00 PM (Slot 7)
        parity = "ODD"
    else:
        slot_num = int((start_min - 480) / 100) + 1
        parity = "ODD" if slot_num % 2 != 0 else "EVEN"

    return f"{day_group}_{parity}"


def sections_share_final_exam_day(secA: Dict, secB: Dict) -> bool:
    """Returns True if two distinct theory courses share the same final exam day."""
    courseA = secA.get("Course", "").strip().upper()
    courseB = secB.get("Course", "").strip().upper()
    if courseA == courseB:
        return False

    keyA = get_final_exam_day_key(secA)
    keyB = get_final_exam_day_key(secB)
    if keyA is None or keyB is None:
        return False
    return keyA == keyB


def get_same_day_final_clashes(sections: List[Dict]) -> List[Tuple[Dict, Dict]]:
    """Returns all pairs of sections in a schedule that share a final exam day."""
    clashes = []
    for i in range(len(sections)):
        for j in range(i + 1, len(sections)):
            if sections_share_final_exam_day(sections[i], sections[j]):
                clashes.append((sections[i], sections[j]))
    return clashes


@dataclass
class GeneratedSchedule:
    sections: List[Dict]

    @property
    def final_clashes(self) -> List[Tuple[Dict, Dict]]:
        return get_same_day_final_clashes(self.sections)

    @property
    def has_same_day_finals(self) -> bool:
        return len(self.final_clashes) > 0

    @property
    def total_seats(self) -> int:
        return sum(s.get("Seats", 0) for s in self.sections)

    @property
    def min_seats(self) -> int:
        seats = [s.get("Seats", 0) for s in self.sections]
        return min(seats) if seats else 0

    @property
    def all_open(self) -> bool:
        return all(s.get("Seats", 0) > 0 for s in self.sections)

    @property
    def days_used(self) -> Set[str]:
        days = set()
        for s in self.sections:
            slots = s.get("_slots") or parse_time_to_slots(s.get("Time", ""))
            for sl in slots:
                days.add(sl.day)
        return days

    @property
    def days_count(self) -> int:
        return len(self.days_used)

    def to_advising_text(self) -> str:
        """Compact format for advising: CSE115.1, CSE115L.1, etc."""
        return ", ".join(f"{s['Course']}.{s['Section']} ({s['Faculty']})" for s in self.sections)


class ScheduleGenerator:
    """Finds all clash-free schedules for a given list of courses."""

    def __init__(self, scraper: Optional[NSUCourseScraper] = None):
        self.scraper = scraper or NSUCourseScraper()

    def generate(
        self,
        course_codes: List[str],
        open_only: bool = False,
        no_same_day_finals: bool = False,
        faculty_preferences: Optional[Dict[str, List[str]]] = None,
        max_results: int = 100
    ) -> List[GeneratedSchedule]:
        """
        Backtracking search to find all clash-free combinations picking 1 section per course.
        Optionally avoids combinations where 2 classes share a final exam day.
        """
        if self.scraper.df.empty:
            self.scraper.fetch()

        df = self.scraper.df

        fac_prefs = dict(faculty_preferences or {})
        sec_prefs: Dict[str, List[str]] = {}
        cleaned_courses = []

        for item in course_codes:
            item = item.strip().upper()
            if not item:
                continue
            if ":" in item:
                parts = item.split(":")
                c = parts[0].strip()
                f = parts[1].strip() if len(parts) > 1 else ""
                s = parts[2].strip() if len(parts) > 2 else ""
                if c not in cleaned_courses:
                    cleaned_courses.append(c)
                if f:
                    fac_prefs.setdefault(c, []).append(f)
                if s:
                    for sub_s in s.split(","):
                        sub_clean = sub_s.strip()
                        if sub_clean:
                            sec_prefs.setdefault(c, []).append(sub_clean)
            else:
                if item not in cleaned_courses:
                    cleaned_courses.append(item)

        # Auto-detect linked labs
        auto_labs = []
        for c in list(cleaned_courses):
            if not c.endswith("L"):
                lab_code = c + "L"
                if lab_code not in cleaned_courses:
                    lab_df = df[df["Course"] == lab_code]
                    if not lab_df.empty:
                        auto_labs.append((c, lab_code))

        for c, lab_code in auto_labs:
            cleaned_courses.append(lab_code)
            pref_facs = fac_prefs.get(c, [])
            pref_secs = sec_prefs.get(c, [])
            lab_df = df[df["Course"] == lab_code]

            if pref_facs:
                matching_lab_facs = [f for f in pref_facs if not lab_df[lab_df["Faculty"].str.upper() == f].empty]
                if matching_lab_facs:
                    fac_prefs[lab_code] = matching_lab_facs
                else:
                    fac_prefs[lab_code] = lab_df["Faculty"].str.upper().unique().tolist()

            if pref_secs:
                matching_lab_secs = [s for s in pref_secs if not lab_df[lab_df["Section"].astype(str).str.strip() == s].empty]
                if matching_lab_secs:
                    sec_prefs[lab_code] = matching_lab_secs

            info_str = f"Faculty: {fac_prefs.get(lab_code, ['All'])}"
            if lab_code in sec_prefs:
                info_str += f", Sec: {sec_prefs[lab_code]}"
            print(f"{Fore.CYAN}[Auto-Lab] Paired course {c} with lab {lab_code} ({info_str}){Style.RESET_ALL}")

        if not cleaned_courses:
            return []

        # Group available sections per course
        course_section_groups: List[Tuple[str, List[Dict]]] = []
        for course in cleaned_courses:
            # Match exact or cross-listed
            mask = df["Course"].apply(
                lambda val: val.upper() == course or f"/{course}" in val.upper() or f"{course}/" in val.upper()
            )
            course_df = df[mask].copy()

            if open_only:
                course_df = course_df[course_df["Seats"] > 0]

            # Faculty preference filter
            if course in fac_prefs:
                fac_list = [f.strip().upper() for f in fac_prefs[course] if f.strip()]
                if fac_list:
                    course_df = course_df[course_df["Faculty"].str.upper().isin(fac_list)]

            # Section preference filter
            if course in sec_prefs:
                sec_list = [s.strip() for s in sec_prefs[course] if s.strip()]
                if sec_list:
                    course_df = course_df[course_df["Section"].astype(str).str.strip().isin(sec_list)]

            records = course_df.to_dict("records")
            # Pre-parse time slots for performance
            for r in records:
                r["_slots"] = parse_time_to_slots(r.get("Time", ""))

            if not records:
                print(
                    f"{Fore.YELLOW}Notice: Course '{course}' has 0 available sections "
                    f"({'open seats only' if open_only else 'in database'}).{Style.RESET_ALL}"
                )
                return []

            course_section_groups.append((course, records))

        # Sort courses by section count ascending (most constrained first = faster backtracking)
        course_section_groups.sort(key=lambda g: len(g[1]))

        # Backtracking search with branch pruning
        valid_schedules: List[GeneratedSchedule] = []

        def backtrack(group_idx: int, current_sections: List[Dict]):
            if group_idx == len(course_section_groups):
                valid_schedules.append(GeneratedSchedule(sections=list(current_sections)))
                return

            _, candidate_sections = course_section_groups[group_idx]

            for sec in candidate_sections:
                # Check conflict with currently selected sections
                conflict = False
                for chosen in current_sections:
                    if sections_clash(sec, chosen):
                        conflict = True
                        break
                    if no_same_day_finals and sections_share_final_exam_day(sec, chosen):
                        conflict = True
                        break

                if not conflict:
                    current_sections.append(sec)
                    backtrack(group_idx + 1, current_sections)
                    current_sections.pop()

                    if len(valid_schedules) >= max_results:
                        return

        backtrack(0, [])

        # Sort results: all open first, then no final clashes first, then minimum days count (compactness), then highest min seats
        valid_schedules.sort(key=lambda s: (not s.all_open, s.has_same_day_finals, s.days_count, -s.min_seats))
        return valid_schedules


def print_weekly_timetable(schedule: GeneratedSchedule):
    """Prints a visual weekly timetable grid for a schedule."""
    # Organize sections by day
    # day -> list of (start_min, end_min, Course, Sec, Room, Faculty, raw_time)
    day_classes: Dict[str, List[Tuple[int, int, str]]] = {d: [] for d in DAYS_ORDER}

    for sec in schedule.sections:
        slots = sec.get("_slots") or parse_time_to_slots(sec.get("Time", ""))
        for sl in slots:
            label = f"{sec['Course']}.{sec['Section']} ({sec['Faculty']}) [{sec['Room']}]"
            day_classes[sl.day].append((sl.start_min, sl.end_min, label, sl.raw_time))

    for d in DAYS_ORDER:
        day_classes[d].sort(key=lambda x: x[0])

    print(f"\n{Fore.CYAN}{Style.BRIGHT}Weekly Schedule Breakdown:{Style.RESET_ALL}")
    print("=" * 80)
    for d in DAYS_ORDER:
        day_name = DAY_NAMES.get(d, d)
        classes = day_classes[d]
        if not classes:
            print(f"{Fore.WHITE}{Style.BRIGHT}{day_name:<10}{Style.RESET_ALL}: {Fore.YELLOW}Day Off (No classes){Style.RESET_ALL}")
        else:
            print(f"{Fore.GREEN}{Style.BRIGHT}{day_name:<10}{Style.RESET_ALL}:")
            for _, _, label, raw_time in classes:
                print(f"   🕒 {raw_time:<24} | {Fore.CYAN}{label}{Style.RESET_ALL}")
    print("=" * 80)


def display_schedule_summary(schedule: GeneratedSchedule, index: int, total: int):
    """Displays a detailed schedule card in terminal."""
    status_str = (
        f"{Fore.GREEN}[ALL OPEN]{Style.RESET_ALL}"
        if schedule.all_open
        else f"{Fore.RED}[SOME FULL]{Style.RESET_ALL}"
    )
    days_names = [DAY_NAMES.get(d, d)[:3] for d in sorted(list(schedule.days_used), key=lambda x: DAYS_ORDER.index(x) if x in DAYS_ORDER else 9)]

    clashes = schedule.final_clashes
    if not clashes:
        finals_str = f"{Fore.GREEN}✅ Spread Out (No Same-Day Finals){Style.RESET_ALL}"
    else:
        pairs_str = ", ".join(f"{s1['Course']} & {s2['Course']}" for s1, s2 in clashes)
        finals_str = f"{Fore.YELLOW}⚠️ Same-Day Finals: {pairs_str}{Style.RESET_ALL}"

    print(f"\n{Fore.MAGENTA}{Style.BRIGHT}=== Schedule #{index} of {total} {status_str} ==={Style.RESET_ALL}")
    print(f"Days on Campus ({schedule.days_count} days): {Fore.YELLOW}{', '.join(days_names)}{Style.RESET_ALL}")
    print(f"Finals Routine: {finals_str}")
    print(f"Quick Advising Code: {Fore.CYAN}{schedule.to_advising_text()}{Style.RESET_ALL}")
    print("-" * 80)

    header_fmt = "{:<12} {:<5} {:<10} {:<24} {:<10} {:<8}"
    print(Fore.BLUE + Style.BRIGHT + header_fmt.format("Course", "Sec", "Faculty", "Time", "Room", "Seats") + Style.RESET_ALL)
    print("-" * 80)

    for sec in schedule.sections:
        seats = sec["Seats"]
        seat_str = f"{Fore.GREEN}{seats:>3} open{Style.RESET_ALL}" if seats > 0 else f"{Fore.RED}   FULL{Style.RESET_ALL}"
        print(
            f"{Fore.CYAN}{sec['Course']:<12}{Style.RESET_ALL} "
            f"{sec['Section']:<5} "
            f"{Fore.WHITE}{Style.BRIGHT}{sec['Faculty']:<10}{Style.RESET_ALL} "
            f"{sec['Time']:<24} "
            f"{sec['Room']:<10} "
            f"{seat_str}"
        )
    print("-" * 80)


def interactive_scheduler(generator: ScheduleGenerator):
    """Interactive CLI prompt for building schedules."""
    print("\n" + "=" * 60)
    print(f"{Fore.CYAN}{Style.BRIGHT}=== NSU Clash-Free Routine & Schedule Builder ==={Style.RESET_ALL}")
    print("=" * 60)

    try:
        generator.scraper.fetch()
        print(f"{Fore.GREEN}[OK] Database ready ({len(generator.scraper.df)} sections loaded).{Style.RESET_ALL}\n")
    except Exception as e:
        print(f"{Fore.RED}Error loading courses: {e}{Style.RESET_ALL}")
        return

    while True:
        print(f"Tip: Filter by faculty or section (e.g. {Fore.CYAN}CSE115:NvA:1, MAT120:MNA, ENG102{Style.RESET_ALL}). Paired labs auto-pair!")
        user_input = input("\nShortlisted Course Codes: ").strip()
        if not user_input:
            print(f"{Fore.YELLOW}No courses entered. Exiting.{Style.RESET_ALL}")
            break

        courses = [c.strip() for c in re.split(r"[\s,]+", user_input) if c.strip()]
        open_only_input = input("Only include sections with open seats (> 0)? (Y/n): ").strip().lower()
        open_only = open_only_input not in ["n", "no"]

        finals_input = input("Avoid same-day final exams (no 1-slot gaps on same day)? (y/N): ").strip().lower()
        no_same_day_finals = finals_input in ["y", "yes"]

        print(f"\nSearching all conflict-free combinations for {courses}...")
        schedules = generator.generate(
            courses,
            open_only=open_only,
            no_same_day_finals=no_same_day_finals,
            max_results=50
        )

        if not schedules:
            print(f"\n{Fore.RED}No conflict-free schedules could be generated with these courses.{Style.RESET_ALL}")
            if no_same_day_finals:
                print(f"{Fore.YELLOW}Tip: Try setting 'avoid same-day finals' to No to see if final exam clashes caused it.{Style.RESET_ALL}")
            elif open_only:
                print(f"{Fore.YELLOW}Tip: Try setting 'open seats only' to No (Y/n) to see if full sections caused it.{Style.RESET_ALL}")
        else:
            print(f"\n{Fore.GREEN}[OK] Generated {len(schedules)} valid conflict-free schedule(s)!{Style.RESET_ALL}")
            current_idx = 0

            while True:
                sch = schedules[current_idx]
                display_schedule_summary(sch, current_idx + 1, len(schedules))
                print_weekly_timetable(sch)

                print("\nOptions: [n] Next Schedule | [p] Prev Schedule | [e] Export CSV | [q] New Search")
                cmd = input("Choice (n/p/e/q): ").strip().lower()

                if cmd == "n":
                    if current_idx < len(schedules) - 1:
                        current_idx += 1
                    else:
                        print(f"{Fore.YELLOW}Reached last schedule.{Style.RESET_ALL}")
                elif cmd == "p":
                    if current_idx > 0:
                        current_idx -= 1
                    else:
                        print(f"{Fore.YELLOW}Already at first schedule.{Style.RESET_ALL}")
                elif cmd == "e":
                    out_name = input("Filename to save (e.g. my_routine.csv): ").strip()
                    if out_name:
                        df_out = pd.DataFrame(sch.sections)
                        df_out.to_csv(out_name, index=False, encoding="utf-8-sig")
                        print(f"{Fore.GREEN}[OK] Saved schedule to {out_name}{Style.RESET_ALL}")
                elif cmd in ["q", "quit", "exit"]:
                    break

        again = input("\nCreate another schedule? (y/N): ").strip().lower()
        if again not in ["y", "yes"]:
            print(f"{Fore.CYAN}Happy advising! Good luck with your semester!{Style.RESET_ALL}")
            break


def main():
    parser = argparse.ArgumentParser(
        description="Generate clash-free course schedules for North South University (NSU) RDS courses."
    )
    parser.add_argument(
        "-c", "--courses",
        nargs="+",
        help="List of course codes to shortlist (e.g. -c CSE115 CSE115L MAT120 ENG102)"
    )
    parser.add_argument(
        "--open-only",
        action="store_true",
        help="Only include sections with available seats (> 0)"
    )
    parser.add_argument(
        "--no-same-day-finals", "--avoid-finals-clash",
        action="store_true",
        dest="no_same_day_finals",
        help="Avoid combinations where 2 classes have their final exams on the same day (e.g. 1-slot gaps on the same day)"
    )
    parser.add_argument(
        "-n", "--max-schedules",
        type=int,
        default=5,
        help="Maximum number of schedules to generate and display (default: 5)"
    )
    parser.add_argument(
        "-o", "--output",
        help="Export first valid schedule to file (.csv, .xlsx, .json)"
    )

    args = parser.parse_args()

    scraper = NSUCourseScraper()
    generator = ScheduleGenerator(scraper)

    if not args.courses:
        interactive_scheduler(generator)
        return

    print(f"Fetching offered courses from NSU RDS...")
    scraper.fetch()

    finals_mode_msg = " [Strict: No same-day finals]" if args.no_same_day_finals else ""
    print(f"Generating conflict-free routines for: {', '.join(args.courses)}{finals_mode_msg}...")
    schedules = generator.generate(
        course_codes=args.courses,
        open_only=args.open_only,
        no_same_day_finals=args.no_same_day_finals,
        max_results=args.max_schedules
    )

    if not schedules:
        print(f"\n{Fore.RED}No conflict-free schedules found for given courses.{Style.RESET_ALL}")
        if args.no_same_day_finals:
            print(f"{Fore.YELLOW}Tip: Try running without --no-same-day-finals to see if same-day finals caused all options to be filtered.{Style.RESET_ALL}")
        sys.exit(1)

    print(f"\n{Fore.GREEN}[OK] Found {len(schedules)} conflict-free schedule(s)!{Style.RESET_ALL}")

    for idx, sch in enumerate(schedules, 1):
        display_schedule_summary(sch, idx, len(schedules))
        print_weekly_timetable(sch)

    if args.output and schedules:
        best = schedules[0]
        df_out = pd.DataFrame(best.sections)
        ext = os.path.splitext(args.output)[1].lower()
        if ext in [".xlsx", ".xls"]:
            df_out.to_excel(args.output, index=False)
        elif ext == ".json":
            df_out.to_json(args.output, orient="records", indent=2)
        else:
            df_out.to_csv(args.output, index=False, encoding="utf-8-sig")
        print(f"{Fore.GREEN}[OK] Exported best schedule to: {args.output}{Style.RESET_ALL}")


if __name__ == "__main__":
    main()

