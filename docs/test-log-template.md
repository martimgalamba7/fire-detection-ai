# Test log (R25)

Copy one block per test. Every test gets a date, a setup and a result.
Gas or smoke tests only in a ventilated place, **never a real fire indoors (R23)**.

---

## Test `T-XX`: `<short title>`

| Field | Value |
|-------|-------|
| Date / time | YYYY-MM-DD HH:MM |
| Tester(s) | |
| Requirement(s) | e.g. FR01, FR05, R11 |
| Location | e.g. outdoor, behind building R1 |
| Setup | hardware, firmware version / git commit, `CONFIDENCE_THRESHOLD`, `NUM_FRAMES` |
| Stimulus | e.g. incense 50 cm from sensors, fog machine, nothing (baseline) |
| Duration | |
| Expected result | |
| Actual result | e.g. `RESULT,smoke,0.84,3/3`, state ALARM after 4.2 s |
| Pass / fail | |
| Serial log file | `logs/T-XX.txt` |
| Notes / photos | |

---

### Tips

* Save the MKR serial output to a file (`arduino-cli monitor -p <port> -c baudrate=115200 > logs/T-XX.txt`).
  `evaluation/false_alarm_count.py` reads the `FUSION,...` lines from it.
* For false-alarm tests (R12), write down when a *real* smoke/fire stimulus was present,
  so the episodes can be labelled afterwards.
