# Company procurement worksheet · 2026-11-02

This is a quote request, not an order or a guaranteed monthly total. No account-specific quotation or purchase was obtained. Do not prepay annually before regional tests and target-hardware load pass.

| Resource | Initial quote specification | First month | Renewal | Overage | Upgrade |
|---|---|---|---|---|---|
| Domain | Company-owned; chosen name/TLD; DNS control | Pending console quote | Annual renewal pending | n/a | n/a |
| Hong Kong Linux VM | 4vCPU/8GiB/100GiB SSD; record CPU family and bandwidth/traffic allowance | Pending console quote | Pending | Public egress/extra disk pending | Quote 8vCPU/16GiB too |
| PostgreSQL | Same host, separate volume, runtime/migration roles | Included VM resources | Included | Disk/CPU pressure | Separate managed DB later |
| Private OSS | 100GB planning assumption; versioning; approved asset prefix | Usage-based, pending | Usage-based | GET/PUT and outbound GB | Capacity grows by usage |
| Separate backup bucket | Hourly encrypted DB dumps; >=30 days; actual volume measured | Pending | Usage-based | Requests/download/version storage | Streaming backup if dump >512MiB |
| Transactional mail | Owner verified domain; expected daily+burst quota | Pending selected account | Usage-based | Sends/retries/increased quota | Provider quota approval |
| TLS | Caddy automatic certificate renewal | No paid certificate planned | n/a | Domain/network still charged | n/a |
| Monitoring | Company on-call destination, uptime/backup/disk/billing alerts | Pending selected service | Pending | SMS/traffic charges if any | n/a |

Official reference only: Alibaba Cloud international DirectMail lists USD 0.29/1000 messages (10000 = USD 2.90 before other/account charges). This is NOT an Aliyun China account quote and SMTP acceptance is not mailbox arrival. [Mail billing](https://www.alibabacloud.com/help/en/direct-mail/billing-methods). OSS bills storage, operations and download traffic separately: [OSS billing](https://www.alibabacloud.com/help/en/oss/billing-overview). Hong Kong international bandwidth may be slow from mainland: [instance guide](https://www.alibabacloud.com/help/en/simple-application-server/user-guide/).

Owner inputs still required: organization identity, resource administrator, billing/operations contacts, domain candidates, brand/logo, approved bilingual activity/legal/privacy/publication content, real activity peak expectations and domestic/overseas testers. Confirm applicable filing/privacy/content obligations for the chosen service region and users before launch; Hong Kong hosting is not a blanket exemption from all obligations.
