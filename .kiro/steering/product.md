---
inclusion: always
---

# Product: FaceFirst

## Pitch

FaceFirst turns any phone or laptop into a 60-second stroke-warning check for caregivers and bystanders. It measures facial droop, arm drift, and speech using on-device computer vision, and it only ever pushes toward calling 911, never away from it.

## Context

- Built at Hackachusetts 2026 (one day). Track: Healthcare & Biotech.
- Judging (equal weight): Potential Value, Implementation (depth of Kiro use), Quality & Design.
- Judges may see only the 3-minute video, write-up, and repo. The demo flow must be reliable and visually clear.
- Hard requirements: public repo, `/.kiro` at repo root and never gitignored, live Vercel URL.

## Problem

- Stroke treatment is time-critical: clot-busting drugs work only within a few hours of onset ("time is brain").
- Families often don't recognize symptoms or wait to see if they pass.
- Nobody records when symptoms started ("last known well"), which can disqualify patients from treatment.
- BE-FAST (Balance, Eyes, Face, Arm, Speech, Time) is taught widely, but people freeze under stress.

## Users

Caregivers of older adults, adult children of aging parents, home health aides, bystanders. Equity focus: rural Western Massachusetts, communities with lower stroke awareness, and non-English speakers (English, Spanish, Portuguese at minimum).

## Differentiators (prior stroke apps exist; say this explicitly)

1. Escalate-only design. Outputs are "Call 911 now" or "We can't rule out a stroke". Never "normal". 911 button on every screen.
2. Personal baseline. A 30-second healthy recording of a loved one, used for comparison against their own face.
3. Last-known-well timestamp + EMS handoff card for paramedics.
4. On-device and private. No video leaves the device.
5. Multilingual, large-text, voice-guided UI.

## User flow

Home → time symptoms noticed → face check → arm check → speech check → BE-FAST questions → result (red or amber) → EMS card. Separate flow: baseline enrollment.

## MVP and cut order

Minimum viable demo: face check + triage engine + result screen. If behind, cut in this order: speech check → baseline → i18n → EMS card polish.
