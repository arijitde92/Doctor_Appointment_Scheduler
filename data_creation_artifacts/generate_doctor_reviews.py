#!/usr/bin/env python3
"""Generate fictitious patient review .txt files per doctor from seed SQL."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / "data" / "seed_sql" / "insert_doctors.sql"
OUT_DIR = ROOT / "data" / "reviews"


def parse_doctors() -> list[tuple[int, str, str, int, int, str]]:
    text = SQL_PATH.read_text(encoding="utf-8")
    pattern = re.compile(
        r"\((\d+),\s*'([^']*)',\s*'([^']*)',\s*(\d+),\s*(\d+),\s*'([^']*)'\)"
    )
    rows = []
    for m in pattern.finditer(text):
        rows.append(
            (
                int(m.group(1)),
                m.group(2),
                m.group(3),
                int(m.group(4)),
                int(m.group(5)),
                m.group(6),
            )
        )
    return sorted(rows, key=lambda r: r[0])


def slug_name(name: str) -> str:
    return re.sub(r"\s+", "_", name.strip())


def pronouns_f(gender: str) -> dict[str, str]:
    if gender == "Male":
        return {"s": "he", "o": "him", "p": "his", "r": "himself"}
    return {"s": "she", "o": "her", "p": "her", "r": "herself"}


def exp_descriptor(years: int) -> str:
    if years <= 2:
        return "relatively new attending with careful habits"
    if years <= 7:
        return "a clinician building strong outpatient rhythm"
    if years <= 14:
        return "well established with practical, up-to-date judgment"
    return "very senior, with steady hands in complex discussions"


def spec_sentence(spec: str, pr: dict[str, str]) -> str:
    s, p = pr["s"], pr["p"]
    lines = {
        "Obstetrics and Gynecology (OB/GYN)": (
            f"{s.capitalize()} discussed options without pressure and respected modesty during the exam."
        ),
        "Pulmonology": (
            f"{s.capitalize()} walked through inhaler technique and what my spirometry trend actually meant."
        ),
        "Neurology": (
            f"{s.capitalize()} explained when imaging was warranted versus watchful waiting for my headaches."
        ),
        "Pediatrics": (
            f"{s.capitalize()} spoke directly to my child and still looped us in as parents on every decision."
        ),
        "Radiology": (
            f"{s.capitalize()} oriented me to key findings on the scan and how they matched my symptoms."
        ),
        "Psychology": (
            f"{s.capitalize()} helped me link sleep, mood, and workload with concrete weekly experiments."
        ),
        "Psychiatry": (
            f"{s.capitalize()} titrated medication carefully and checked side effects at each step."
        ),
        "Cardiology": (
            f"{s.capitalize()} clarified family risk, blood pressure targets, and warning signs to act on."
        ),
        "Orthopedic": (
            f"{s.capitalize()} prioritized physical therapy before procedures and set realistic activity limits."
        ),
        "Gastroenterology": (
            f"{s.capitalize()} outlined diet triggers, acid control, and what endoscopy would or would not prove."
        ),
        "General": (
            f"{s.capitalize()} handled screening, chronic issues, and referrals without making me feel bounced around."
        ),
        "Pathology": (
            f"{s.capitalize()} translated biopsy wording and timelines so my treating team and I stayed aligned."
        ),
    }
    return lines.get(
        spec,
        f"{s.capitalize()} stayed focused on my questions and mapped sensible next steps.",
    )


def spec_short_label(spec: str) -> str:
    return {
        "Obstetrics and Gynecology (OB/GYN)": "women’s health and pregnancy",
        "Pulmonology": "lung and breathing care",
        "Neurology": "neurologic symptoms",
        "Pediatrics": "pediatric care",
        "Radiology": "imaging results",
        "Psychology": "therapy goals",
        "Psychiatry": "psychiatric treatment",
        "Cardiology": "heart health",
        "Orthopedic": "bone and joint problems",
        "Gastroenterology": "digestive symptoms",
        "General": "primary care",
        "Pathology": "lab and pathology coordination",
    }.get(spec, spec.lower())


def clamp_words(text: str, limit: int = 100) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    words = text.split()
    if len(words) <= limit:
        return text
    return " ".join(words[:limit])


def second_spec_sentence(spec: str, pr: dict[str, str], topic: str) -> str:
    s = pr["s"]
    follow = {
        "Obstetrics and Gynecology (OB/GYN)": (
            f"{s.capitalize()} coordinated ultrasound timing and postpartum questions without making me feel silly."
        ),
        "Pulmonology": (
            f"{s.capitalize()} set a clear action plan for flare-ups and when to go to emergency care."
        ),
        "Neurology": (
            f"{s.capitalize()} charted symptom timing carefully, which helped narrow possible triggers."
        ),
        "Pediatrics": (
            f"{s.capitalize()} gave practical dosing guidance and what to watch overnight when fever spiked."
        ),
        "Radiology": (
            f"{s.capitalize()} compared this scan to prior films so the change in a nodule was understandable."
        ),
        "Psychology": (
            f"{s.capitalize()} balanced listening with gentle challenges that kept me accountable week to week."
        ),
        "Psychiatry": (
            f"{s.capitalize()} warned me about early side effects so I did not panic when they appeared briefly."
        ),
        "Cardiology": (
            f"{s.capitalize()} adjusted BP goals to my comorbidities instead of quoting a one-line textbook target."
        ),
        "Orthopedic": (
            f"{s.capitalize()} explained why bracing helped in my case and when to wean off it safely."
        ),
        "Gastroenterology": (
            f"{s.capitalize()} sequenced acid blockers and diet trials logically before escalating tests."
        ),
        "General": (
            f"{s.capitalize()} helped me prioritize which minor complaints to track versus which to ignore for now."
        ),
        "Pathology": (
            f"{s.capitalize()} spelled out what pending stains could still change and what was already firm."
        ),
    }
    return follow.get(
        spec,
        f"I could tell {s} stays current in {topic} rather than recycling outdated advice.",
    )


def unique_bank_for_doctor(
    doc_id: int, name: str, gender: str, age: int, years: int, spec: str
) -> list[tuple[int, str]]:
    rng = int(hashlib.sha256(f"{doc_id}:{name}:{spec}".encode()).hexdigest(), 16)
    pr = pronouns_f(gender)
    s, p = pr["s"], pr["p"]

    def pick(seq: list, i: int):
        return seq[(rng >> (i * 3)) % len(seq)]

    topic = spec_short_label(spec)
    exp_d = exp_descriptor(years)
    spec_a = spec_sentence(spec, pr)
    spec_b = second_spec_sentence(spec, pr, topic)

    mild = pick(
        [
            (
                f"Front-desk delays stacked up on a busy morning; once I reached {name}, "
                f"{s} was thorough and apologized for the system, but I still lost half a day."
            ),
            (
                f"A portal message about refills lingered unanswered longer than promised; "
                f"when {s} heard, {s} fixed it quickly, yet the silence beforehand rattled me."
            ),
            (
                f"One visit felt compressed—{s} covered essentials but I drove home with leftover questions "
                f"until a nurse called back later with clarifications."
            ),
        ],
        5,
    )

    harsher = pick(
        [
            (
                f"I left one appointment feeling unheard about side effects; a later visit went better, "
                f"but that rough day nearly pushed me to switch clinics."
            ),
            (
                f"Billing confusion on a procedure code took weeks to unwind; clinically I respect {name}, "
                f"yet administrative friction was exhausting."
            ),
            (
                f"Phone triage once minimized pain I had flagged repeatedly; {s} ultimately corrected course, "
                f"but trust dipped before it recovered."
            ),
        ],
        6,
    )

    pairs: list[tuple[int, str]] = [
        (
            9,
            clamp_words(
                f"My care with {name} centered on {topic}. {spec_a} "
                f"{s.capitalize()} matched explanations to how much detail I wanted that day."
            ),
        ),
        (
            pick([8, 9], 9),
            clamp_words(
                f"With about {years} years in practice, {s} reads as {exp_d}. "
                f"I never felt rushed through shared decision-making on the main problem I came in for."
            ),
        ),
        (
            10,
            clamp_words(
                f"{spec_b} Follow-up on labs landed sooner than I expected, which lowered my anxiety between visits."
            ),
        ),
        (
            9,
            clamp_words(
                f"{s.capitalize()} tied my story together across two separate problems instead of treating each visit in isolation. "
                f"That continuity is rare and noticeable."
            ),
        ),
        (
            8,
            clamp_words(
                f"I brought printouts from the internet; {s} smiled, not scoffed, and pointed me to better sources. "
                f"Even pushback felt respectful."
            ),
        ),
        (
            10,
            clamp_words(
                f"Preventive advice matched my age ({age}-ish range for many patients {s} sees) "
                f"without doom-scrolling me about every risk."
            ),
        ),
        (
            9,
            clamp_words(
                f"When I needed a letter for work accommodations, {s} wrote something clear and factual the first time—small thing, huge relief."
            ),
        ),
        (
            pick([6, 7], 10),
            clamp_words(mild),
        ),
        (
            pick([4, 5], 11),
            clamp_words(harsher),
        ),
        (
            pick([8, 9], 12),
            clamp_words(
                f"Overall I would recommend {name} for {topic}. The clinic is imperfect like any busy practice, "
                f"but {p} clinical judgment and willingness to revise a plan when something fails keep me returning."
            ),
        ),
    ]

    order = list(range(10))
    for i in range(9, 0, -1):
        j = (rng >> (i * 5)) % (i + 1)
        order[i], order[j] = order[j], order[i]
    return [pairs[k] for k in order]


def overall_line(ratings: list[int]) -> str:
    avg = sum(ratings) / len(ratings)
    return f"Overall rating: {avg:.2f}/10"


def write_file(path: Path, pairs: list[tuple[int, str]]) -> None:
    lines: list[str] = []
    for i, (rating, desc) in enumerate(pairs, start=1):
        lines.append(f"Review {i}")
        lines.append(f"Rating: {rating}/10")
        lines.append(f"Description: {desc}")
        lines.append("")
    lines.append(overall_line([r for r, _ in pairs]))
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    doctors = parse_doctors()
    for doc_id, name, gender, age, years, spec in doctors:
        pairs = unique_bank_for_doctor(doc_id, name, gender, age, years, spec)
        fname = f"doctor_{doc_id}_{slug_name(name)}_reviews.txt"
        write_file(OUT_DIR / fname, pairs)
    print(f"Wrote {len(doctors)} files to {OUT_DIR}")


if __name__ == "__main__":
    main()
