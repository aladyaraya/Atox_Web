# Release evidence checklist

Default: NOT RELEASED. Empty fields are blockers, not passed tests.

| Gate | Required evidence | Status |
|---|---|---|
| Reviewed source | main commit, reviewed PR, dependency/image scan, all CI checks | [PR #7](https://github.com/aladyaraya/Atox_Web/pull/7): M016 checks passed; current full regression depends on separate ticketing test fix; human review/merge and image security promotion pending |
| Company ownership | Domain/cloud account owner, on-call and billing contacts | Not supplied |
| Infrastructure | Real quote, selected region, restricted security group, private DB, object ACL/versioning | Not supplied |
| Production mail | SPF/DKIM/DMARC/provider status, quota; real QQ/163/Gmail/Outlook arrivals | Not supplied |
| Login/security | New+existing email, resend/expiry/failure/logout, foreign Origin, dev/OIDC/payment closed | Automated fixtures + real deployment required |
| Business | Registration/team/material/review/project publication/comment, proper authorization | Existing regressions + protected cloud rehearsal |
| Content | Approved brand, homepage/activities, legal/privacy/contact, administrator assignments; no demo exposure | Not supplied |
| Load | 10000 synthetic accounts, gradual 50→150→300 VUs, 15min steady 300, 80% browse/15% writes/5% uploads; independent 20MiB document/5MiB image and deadline/retry stress | Not run on target hardware |
| Performance | Ordinary server requests P95 <2s and unexpected errors <1%; email arrival/upload throughput separate; no corruption/duplicates/OOM | Not measured on target hardware |
| Recovery | Verified hourly encrypted backups; >=30d assets/versions; clean-target restore, referenced file hashes; measured <=4h recovery | Cloud rehearsal pending |
| Monitoring | Real on-call alerts delivered for uptime, backup age, disk, cert, errors and fees | Not configured |
| Release approval | Owner signs evidence; LAUNCH_APPROVED=true; readiness passes; remove staging protection last | Not approved |

The 300-VU mix is an initial reproducible scenario, not a claim that 300 simultaneous largest-file uploads are supported. Stop public release if tests fail; optimize or upgrade then rerun. Do not silently lower limits or rewrite activity deadlines to pass tests. Low-cost single-host deployment accepts maintenance downtime and has no automatic failover.
