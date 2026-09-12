#!/usr/bin/env python3
"""
Example of using NSUCourseScraper programmatically.
"""

from scraper import NSUCourseScraper

def main():
    print("Initializing NSU Course Scraper...")
    scraper = NSUCourseScraper()

    # 1. Fetch live data
    scraper.fetch()
    print(f"Total sections fetched: {len(scraper.df)}")

    # 2. Filter courses (e.g. CSE115, MAT120, ENG102)
    # include_labs=True will match both CSE115 and CSE115L
    print("\n--- Filtering CSE115 & MAT120 ---")
    results = scraper.filter(
        courses=["CSE115", "MAT120"],
        open_only=True,
        include_labs=True
    )
    scraper.display(max_rows=10)

    # 3. Filter by Faculty (e.g. NvA)
    print("\n--- Filtering by Faculty NvA ---")
    scraper.filter(faculties=["NvA"])
    scraper.display(max_rows=10)

    # 4. Access as pandas DataFrame
    print(f"\nPandas DataFrame shape: {scraper.filtered_df.shape}")
    print(scraper.filtered_df[["Course", "Section", "Faculty", "Seats"]].head())

if __name__ == "__main__":
    main()

