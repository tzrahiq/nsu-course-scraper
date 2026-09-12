#!/usr/bin/env python3
"""
NSU RDS Offered Courses Table Scraper & Filter
Extracts course and faculty information from https://rds4.northsouth.ac.bd/offered_courses
"""

import argparse
import os
import re
import sys
import urllib.request
from typing import Dict, List, Optional

from bs4 import BeautifulSoup
import pandas as pd

try:
    import colorama
    from colorama import Fore, Style
    colorama.init(autoreset=True)
    COLOR_ENABLED = True
except ImportError:
    COLOR_ENABLED = False
    class Fore:
        GREEN = RED = YELLOW = CYAN = BLUE = MAGENTA = WHITE = RESET = ""
    class Style:
        BRIGHT = RESET_ALL = ""


if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
DEFAULT_URL = "https://rds4.northsouth.ac.bd/offered_courses"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


class NSUCourseScraper:
    """Scraper and filter for North South University Offered Courses."""

    def __init__(self, url: str = DEFAULT_URL, user_agent: str = DEFAULT_USER_AGENT):
        self.url = url
        self.user_agent = user_agent
        self.semester: str = ""
        self.last_synced: str = ""
        self.df: pd.DataFrame = pd.DataFrame()
        self.filtered_df: pd.DataFrame = pd.DataFrame()

    def fetch(self) -> "NSUCourseScraper":
        """Fetches and parses the offered courses table from NSU RDS."""
        req = urllib.request.Request(self.url, headers={"User-Agent": self.user_agent})
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                html_content = response.read().decode("utf-8", errors="ignore")
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"HTTP Error {e.code}: {e.reason} while fetching {self.url}") from e
        except Exception as e:
            raise RuntimeError(f"Failed to connect to {self.url}: {e}") from e

        soup = BeautifulSoup(html_content, "html.parser")

        # Extract metadata
        title_el = soup.find("h1", class_="page-title")
        if title_el:
            self.semester = re.sub(r"\s+", " ", title_el.get_text(strip=True))

        sync_el = soup.find("div", class_="sync-info")
        if sync_el:
            self.last_synced = re.sub(r"\s+", " ", sync_el.get_text(strip=True))

        # Extract Table
        table = soup.find("table", id="offeredCourseTbl")
        if not table:
            raise ValueError("Could not find table #offeredCourseTbl on the webpage.")

        tbody = table.find("tbody")
        if not tbody:
            raise ValueError("Table #offeredCourseTbl does not contain a <tbody> element.")

        rows = tbody.find_all("tr")
        records = []
        for r in rows:
            tds = r.find_all("td")
            if len(tds) >= 7:
                seat_str = tds[6].get_text(strip=True)
                try:
                    seats = int(seat_str)
                except ValueError:
                    seats = 0

                records.append({
                    "Serial": tds[0].get_text(strip=True),
                    "Course": tds[1].get_text(strip=True),
                    "Section": tds[2].get_text(strip=True),
                    "Faculty": tds[3].get_text(strip=True),
                    "Time": re.sub(r"\s+", " ", tds[4].get_text(strip=True)),
                    "Room": tds[5].get_text(strip=True),
                    "Seats": seats
                })

        self.df = pd.DataFrame(records)
        self.filtered_df = self.df.copy()
        return self

    def filter(
        self,
        courses: Optional[List[str]] = None,
        faculties: Optional[List[str]] = None,
        open_only: bool = False,
        include_labs: bool = True,
        match_mode: str = "and"
    ) -> pd.DataFrame:
        """Filters the cached courses by course codes, faculties, and seat availability."""
        if self.df.empty:
            self.fetch()

        df = self.df.copy()

        # Clean token inputs
        course_tokens = [c.strip().upper() for c in (courses or []) if c.strip()]
        faculty_tokens = [f.strip().upper() for f in (faculties or []) if f.strip()]

        # Filter: Seats
        if open_only:
            df = df[df["Seats"] > 0]

        # Course mask
        course_mask = None
        if course_tokens:
            def match_course(course_val: str) -> bool:
                c_up = str(course_val).upper()
                for token in course_tokens:
                    if include_labs:
                        if c_up == token or c_up.startswith(token) or f"/{token}" in c_up or f"{token}/" in c_up:
                            return True
                    else:
                        if c_up == token or f"/{token}" in c_up or f"{token}/" in c_up:
                            return True
                return False
            course_mask = df["Course"].apply(match_course)

        # Faculty mask
        faculty_mask = None
        if faculty_tokens:
            def match_faculty(fac_val: str) -> bool:
                f_up = str(fac_val).upper()
                for token in faculty_tokens:
                    if f_up == token or token in f_up:
                        return True
                return False
            faculty_mask = df["Faculty"].apply(match_faculty)

        # Combine masks
        if course_mask is not None and faculty_mask is not None:
            if match_mode.lower() == "or":
                df = df[course_mask | faculty_mask]
            else:
                df = df[course_mask & faculty_mask]
        elif course_mask is not None:
            df = df[course_mask]
        elif faculty_mask is not None:
            df = df[faculty_mask]

        self.filtered_df = df
        return self.filtered_df

    def display(self, max_rows: int = 100) -> None:
        """Prints formatted table to the terminal with color indicators."""
        df = self.filtered_df
        total_open = int(df[df["Seats"] > 0]["Seats"].sum()) if not df.empty else 0
        open_sections = int((df["Seats"] > 0).sum()) if not df.empty else 0

        print("\n" + "=" * 80)
        print(f"{Fore.CYAN}{Style.BRIGHT}NSU RDS Offered Courses Scraper{Style.RESET_ALL}")
        if self.semester:
            print(f"Semester: {Fore.YELLOW}{self.semester}{Style.RESET_ALL}")
        if self.last_synced:
            print(f"Status:   {Fore.WHITE}{self.last_synced}{Style.RESET_ALL}")
        print("=" * 80)

        if df.empty:
            print(f"{Fore.RED}No courses found matching your criteria.{Style.RESET_ALL}\n")
            return

        print(
            f"Matching Sections: {Fore.GREEN}{len(df)}{Style.RESET_ALL} | "
            f"Open Sections: {Fore.GREEN}{open_sections}{Style.RESET_ALL} | "
            f"Total Open Seats: {Fore.GREEN}{total_open}{Style.RESET_ALL}"
        )
        print("-" * 80)

        # Format column widths
        header_fmt = "{:<5} {:<12} {:<5} {:<12} {:<24} {:<10} {:<8}"
        print(Fore.BLUE + Style.BRIGHT + header_fmt.format(
            "#", "Course", "Sec", "Faculty", "Time", "Room", "Seats"
        ) + Style.RESET_ALL)
        print("-" * 80)

        count = 0
        for _, row in df.iterrows():
            count += 1
            if count > max_rows:
                remaining = len(df) - max_rows
                print(f"{Fore.YELLOW}... and {remaining} more sections (use --output to export all){Style.RESET_ALL}")
                break

            seats = row["Seats"]
            if seats > 0:
                seat_str = f"{Fore.GREEN}{seats:>3} open{Style.RESET_ALL}"
            elif seats == 0:
                seat_str = f"{Fore.RED}   FULL{Style.RESET_ALL}"
            else:
                seat_str = f"{Fore.YELLOW}{seats:>3} WL{Style.RESET_ALL}"

            print(
                f"{str(row['Serial']):<5} "
                f"{Fore.CYAN}{str(row['Course']):<12}{Style.RESET_ALL} "
                f"{str(row['Section']):<5} "
                f"{Fore.WHITE}{Style.BRIGHT}{str(row['Faculty']):<12}{Style.RESET_ALL} "
                f"{str(row['Time']):<24} "
                f"{str(row['Room']):<10} "
                f"{seat_str}"
            )

        print("-" * 80 + "\n")

    def export(self, filepath: str) -> None:
        """Exports the filtered courses to CSV, Excel, or JSON based on file extension."""
        if self.filtered_df.empty:
            print(f"{Fore.YELLOW}Warning: Filtered dataset is empty. Nothing to export.{Style.RESET_ALL}")
            return

        ext = os.path.splitext(filepath)[1].lower()
        if ext == ".csv":
            self.filtered_df.to_csv(filepath, index=False, encoding="utf-8-sig")
        elif ext in [".xlsx", ".xls"]:
            self.filtered_df.to_excel(filepath, index=False)
        elif ext == ".json":
            self.filtered_df.to_json(filepath, orient="records", indent=2)
        else:
            # Default to CSV
            filepath += ".csv"
            self.filtered_df.to_csv(filepath, index=False, encoding="utf-8-sig")

        print(f"{Fore.GREEN}[OK] Exported {len(self.filtered_df)} rows to: {filepath}{Style.RESET_ALL}")


def interactive_mode(scraper: NSUCourseScraper):
    """Runs interactive prompts for ease of use."""
    print("\n" + "=" * 60)
    print(f"{Fore.CYAN}{Style.BRIGHT}=== NSU RDS Courses Scraper - Interactive Mode ==={Style.RESET_ALL}")
    print("=" * 60)

    try:
        scraper.fetch()
        print(f"{Fore.GREEN}[OK] Successfully fetched {len(scraper.df)} course sections from NSU RDS!{Style.RESET_ALL}\n")
    except Exception as e:
        print(f"{Fore.RED}Error connecting to NSU RDS: {e}{Style.RESET_ALL}")
        return

    while True:
        courses_input = input("Enter course code(s) (comma-separated, e.g. CSE115, MAT120) [or Enter for all]: ").strip()
        faculty_input = input("Enter faculty initial(s) (comma-separated, e.g. NvA, Shaifur) [or Enter for all]: ").strip()
        open_input = input("Show available seats only? (y/N): ").strip().lower()
        open_only = open_input in ["y", "yes"]

        course_list = [c.strip() for c in re.split(r"[\s,]+", courses_input) if c.strip()]
        faculty_list = [f.strip() for f in re.split(r"[\s,]+", faculty_input) if f.strip()]

        scraper.filter(courses=course_list, faculties=faculty_list, open_only=open_only)
        scraper.display()

        export_choice = input("Export results to file? (e.g. results.csv, results.xlsx, or Enter to skip): ").strip()
        if export_choice:
            scraper.export(export_choice)

        again = input("\nSearch again? (y/N): ").strip().lower()
        if again not in ["y", "yes"]:
            print(f"{Fore.CYAN}Exiting NSU Course Scraper. Happy advising!{Style.RESET_ALL}")
            break


def main():
    parser = argparse.ArgumentParser(
        description="Scrape and filter courses from North South University (NSU) RDS Offered Courses page."
    )
    parser.add_argument(
        "-c", "--courses",
        nargs="+",
        help="One or more course codes to filter (e.g. -c CSE115 MAT120 ENG102)"
    )
    parser.add_argument(
        "-f", "--faculties",
        nargs="+",
        help="One or more faculty initials/names to filter (e.g. -f NvA Shaifur ARM)"
    )
    parser.add_argument(
        "--open-only",
        action="store_true",
        help="Only display sections that currently have available seats (> 0)"
    )
    parser.add_argument(
        "--no-labs",
        action="store_true",
        help="Strict exact match for course code (do not match lab extensions like CSE115L for CSE115)"
    )
    parser.add_argument(
        "--match-mode",
        choices=["and", "or"],
        default="and",
        help="Matching mode when both course and faculty are provided (default: and)"
    )
    parser.add_argument(
        "-o", "--output",
        help="Save filtered results to file (.csv, .xlsx, .json)"
    )
    parser.add_argument(
        "-i", "--interactive",
        action="store_true",
        help="Run in interactive guided prompt mode"
    )

    args = parser.parse_args()

    # If no arguments provided at all, default to interactive mode
    if len(sys.argv) == 1 or args.interactive:
        scraper = NSUCourseScraper()
        interactive_mode(scraper)
        return

    scraper = NSUCourseScraper()
    print(f"Connecting to {DEFAULT_URL}...")
    try:
        scraper.fetch()
    except Exception as e:
        print(f"{Fore.RED}Error: {e}{Style.RESET_ALL}", file=sys.stderr)
        sys.exit(1)

    scraper.filter(
        courses=args.courses,
        faculties=args.faculties,
        open_only=args.open_only,
        include_labs=not args.no_labs,
        match_mode=args.match_mode
    )

    scraper.display()

    if args.output:
        scraper.export(args.output)


if __name__ == "__main__":
    main()
