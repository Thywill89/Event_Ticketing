# Event Ticketing System

**Product, System & Architecture Plan — Pre-Development Blueprint**

> **CORE TICKET VERIFICATION RULE**
>
> QR = PRIMARY | Ticket Number = BACKUP

Prepared for system planning before development

18 September 2026 • Version 1.0

## 0. Document Control

Purpose, scope and design decisions that govern this planning document.

| **Item**                      | **Value**                                                             |
|-------------------------------|-----------------------------------------------------------------------|
| Document type                 | Product, system and architecture planning blueprint                   |
| Status                        | Pre-development planning                                              |
| Version                       | 1.0                                                                   |
| Date                          | 18 September 2026                                                     |
| Scope                         | General-purpose event ticketing for parties and other ticketed events |
| Primary ticket verification   | QR code                                                               |
| Fallback ticket verification  | Human-readable ticket number                                          |
| Initial architecture approach | Modular monolith                                                      |
| Customer account model        | No customer login required                                            |

> **DESIGN DECISION LOCKED IN**
>
> At the entrance, the QR code is the normal verification method. The ticket number is the backup method only when QR scanning is unavailable or fails. Both paths use the same backend ticket-validation rules.

## 1. Contents

Organized by product area, workflow, architecture, security and delivery phases.

| **2**  | [Executive Summary](#2-executive-summary)                  | **12** | [Data Model & Database Concept](#12-data-model-database-concept)                 |
|--------|----------------------------------------------------|--------|----------------------------------------------------------------|
| **3**  | [System Overview & Business Concept](#3-system-overview-business-concept) | **13** | [Application & Technical Architecture](#13-application-technical-architecture)          |
| **4**  | [Users, Roles & Permissions](#4-users-roles-permissions)         | **14** | [Security, Authorization & Audit](#14-security-authorization-audit)               |
| **5**  | [Public Customer Experience](#5-public-customer-experience)         | **15** | [Notifications, Refunds & Financial Operations](#15-notifications-refunds-financial-operations) |
| **6**  | [Organizer & Event Management](#6-organizer-event-management)       | **16** | [Edge Cases & Reliability Rules](#16-edge-cases-reliability-rules)                |
| **7**  | [Ticketing, Inventory & Orders](#7-ticketing-inventory-orders)      | **17** | [MVP & Future Roadmap](#17-mvp-future-roadmap)                          |
| **8**  | [Payments & Ticket Issuance](#8-payments-ticket-issuance)         | **18** | [Core Data Flows](#18-core-data-flows)                               |
| **9**  | [Ticket Verification & Attendance](#9-ticket-verification-attendance)   | **19** | [Final Architecture Vision](#19-final-architecture-vision)                     |
| **10** | [Organizer Dashboard & Reporting](#10-organizer-dashboard-reporting)   | **20** | [Pre-Development Design Checklist](#20-pre-development-design-checklist)              |
| **11** | [Platform Administration](#11-platform-administration)           |        |                                                                |

## 2. Executive Summary

The platform connects event organizers with customers while separating sales, tickets and attendance as distinct business records.

The platform is a general-purpose event ticketing system for house parties, pool parties, beach parties, concerts, birthdays, weddings, school events, corporate events, nightlife events and other ticketed experiences.

The core product principle is simplicity for customers and control for organizers. Customers can discover events and purchase tickets without creating accounts. Organizers log in to create and manage events, configure ticket types, monitor sales and manage check-in staff. Check-in staff use a mobile-first interface to verify tickets at the event entrance. Platform administrators oversee organizers, events, payments, check-ins and operational activity.

The system deliberately separates orders, tickets, payments and attendance. One order may contain multiple tickets, but each ticket remains individually identifiable and independently verifiable. Attendance is counted only when a valid ticket is successfully checked in.

> **NON-NEGOTIABLE VERIFICATION PRINCIPLE**
>
> QR = PRIMARY. Ticket Number = BACKUP.

## 3. System Overview & Business Concept

The business relationship and high-level operating model.

### 3.1 What the Platform Does

The platform provides an end-to-end process from event creation to ticket purchase and finally to verified event attendance. The system should work for many event types rather than being designed around one specific party format.

```text
Organizer → Event → Ticket Type → Order → Payment → Ticket → Check-In
```

### 3.2 Four User Categories

| **User**            | **Login?** | **Primary responsibility**                          |
|---------------------|------------|-----------------------------------------------------|
| Customer / Attendee | No         | Discover events and purchase tickets.               |
| Organizer           | Yes        | Create and manage events, tickets, sales and staff. |
| Check-in Staff      | Yes        | Verify tickets and record attendance.               |
| Platform Admin      | Yes        | Manage and monitor the platform.                    |

### 3.3 Foundational Business Rule

> **ORDER ≠ TICKET**
>
> An order represents a purchase transaction. A ticket represents one individual admission credential. One order can contain multiple tickets.

```text
Order #10025
├── Ticket A
├── Ticket B
├── Ticket C
└── Ticket D
```

## 4. Users, Roles & Permissions

Who can access the system, what they can do and where permissions must stop.

### 4.1 Customer / Attendee

- No account is required to purchase a ticket.
- Can browse, search, filter and view events.
- Can select ticket type and quantity.
- Can provide the information required by the event.
- Can complete payment and receive ticket(s).

### 4.2 Organizer

- Must have an authenticated account.
- Can manage their profile, events, ticket types, sales, attendees and reports.
- Can create and manage check-in staff for their events.
- Must only be able to access their own resources.

### 4.3 Check-in Staff

- Can log in and access assigned events.
- Can scan QR codes and use ticket-number fallback verification.
- Can perform check-ins and view basic attendance information.
- Cannot change event prices, ticket inventory, event content or organizer settings.

### 4.4 Platform Admin

- Can manage organizers and events.
- Can approve, suspend or unpublish organizers/events as defined by policy.
- Can monitor sales, payments, refunds, check-ins and platform activity.
- Can review reports and system settings.

> **AUTHORIZATION PRINCIPLE**
>
> Authentication answers “Who are you?” Authorization answers “What are you allowed to do?” Organizer and staff permissions must be enforced server-side, not only hidden in the interface.

## 5. Public Customer Experience

The public-facing journey from discovering an event to receiving a ticket.

### 5.1 Customer Journey

#### Customer Purchase Flow

| **Discover** | **View Event** | **Select Ticket** | **Checkout** | **Pay** | **Verify Payment** | **Issue Ticket** |
|--------------|----------------|-------------------|--------------|---------|--------------------|------------------|

### 5.2 Event Discovery

- View upcoming events.
- Search events.
- Filter by category, date, location and price.
- Open a dedicated event page.

### 5.3 Event Page Requirements

| **Area**               | **Information**                                                                       |
|------------------------|---------------------------------------------------------------------------------------|
| Event identity         | Event name, main image, gallery images, organizer                                     |
| Event details          | Date, start time, end time, venue, location/address, description                      |
| Additional information | Dress code, age requirements, rules, attendee guidance, contact details, social links |
| Tickets                | Ticket type, price, availability and purchase action                                  |

### 5.4 Checkout Information

- Full name.
- Phone number.
- Email address.
- Optional per-attendee information when an event requires individual attendee details.

> **DATA MINIMIZATION**
>
> Collect only the personal information required to sell, deliver and validate the ticket for the event.

## 6. Organizer & Event Management

How organizers create, publish and manage events and ticket offerings.

### 6.1 Organizer Capabilities

- Register and log in.
- Manage profile information.
- Create, edit and publish events subject to platform rules.
- Configure ticket types and quantities.
- Monitor sales and attendees.
- Manage check-in staff.
- View reports and attendance.

### 6.2 Event Creation Structure

| **Section**          | **Fields / responsibilities**                                              |
|----------------------|----------------------------------------------------------------------------|
| A. Basic Information | Event name, category, description, main image, gallery images              |
| B. Date & Time       | Event date, start time, end time                                           |
| C. Venue             | Venue name, address, city/area, map/location information                   |
| D. Event Information | Dress code, age restriction, rules, notices, contact details, social links |
| E. Tickets           | Ticket name, price, quantity, sales start, sales end, description/benefits |

### 6.3 Event Publishing Workflow

```text
DRAFT → SUBMITTED → UNDER REVIEW → APPROVED → PUBLISHED → SALES OPEN → SALES CLOSED → COMPLETED
```

Possible exceptional states include PAUSED, CANCELLED and POSTPONED. The purpose is to give the platform control over what appears publicly and what actions remain available.

### 6.4 Event Status Model

| **Status**            | **Meaning / control purpose**                      |
|-----------------------|----------------------------------------------------|
| DRAFT                 | Organizer is still preparing the event.            |
| PENDING REVIEW        | Event has been submitted for platform review.      |
| APPROVED              | Platform has approved the event for publication.   |
| PUBLISHED             | Event is visible according to publishing rules.    |
| SALES OPEN            | Ticket purchases are accepted.                     |
| SALES PAUSED          | Sales temporarily stopped.                         |
| SALES CLOSED          | Sales period has ended.                            |
| LIVE                  | Event is currently taking place / entry is active. |
| COMPLETED             | Event has ended.                                   |
| CANCELLED / POSTPONED | Event will not proceed as originally scheduled.    |

## 7. Ticketing, Inventory & Orders

The rules that govern ticket types, stock, reservations and purchase records.

### 7.1 Ticket Types

An organizer can create multiple ticket types per event, for example Early Bird, Regular, VIP and VVIP. Each ticket type should have its own price, quantity, sales window and optional description/benefits.

### 7.2 Inventory Example

```text
Regular = 500
VIP = 100
VVIP = 30

Total = 630
```

### 7.3 Overselling Prevention

The architecture must handle two customers attempting to purchase the final available ticket at nearly the same time. Ticket inventory must be protected so only one valid purchase can consume that remaining inventory.

### 7.4 Temporary Reservation

#### Inventory Lifecycle

| **Available** | **Temporarily Reserved** | **Payment Successful** | **Sold** |
|---------------|--------------------------|------------------------|----------|

If payment is not completed within the configured reservation window, the reservation expires and inventory returns to Available.

### 7.5 Order Structure

An order records the purchase transaction and connects the purchaser to one event, one payment transaction and one or more individual tickets. Historical purchase prices and commercial records must remain intact even when future ticket prices change.

```text
ORDER #10025
Customer: John Doe
Event: Beach Vibes 2026
Tickets: 2 × VIP, 1 × Regular
Total: GH₵600
```

## 8. Payments & Ticket Issuance

How money moves through the platform and when a ticket becomes valid.

### 8.1 Payment Lifecycle

```text
Customer → Checkout → Payment Gateway → Payment Provider → Backend Verification → Order Marked PAID → Tickets Generated
```

### 8.2 Payment Trust Rule

The browser should not be treated as the final authority for payment success. A customer seeing “Payment Successful” in the browser must not, by itself, cause the backend to issue valid tickets. The backend should verify the transaction through the payment provider’s supported verification/webhook process.

### 8.3 Ticket Issuance

Tickets should be generated only after successful payment verification. Each ticket receives its own identity and can later be checked independently.

```text
EVENT: Beach Vibes 2026
TICKET TYPE: VIP
TICKET NUMBER: EVT-8F4K7P
ATTENDEE: John Doe
DATE: 12 December 2026
TIME: 4:00 PM
VENUE: XYZ Beach
QR CODE
```

### 8.4 Ticket Status Lifecycle

```text
CREATED → RESERVED → PAID → ISSUED → CHECKED-IN

Other states: CANCELLED · REFUNDED · VOID · EXPIRED
```

**IMPORTANT DISTINCTION: PAID, ATTENDED and ORDER are separate states and records.**

## 9. Ticket Verification & Attendance

The most important operational part of the platform: safely deciding who gets into the event.

> **VERIFICATION RULE**
>
> QR = PRIMARY | Ticket Number = BACKUP

### 9.1 Primary Method: QR Scan

#### QR Verification

| **Customer Arrives** | **Shows Ticket** | **Staff Scans QR** | **Backend Validates** | **Result Returned** |
|----------------------|------------------|--------------------|-----------------------|---------------------|

### 9.2 Validation Rules

1.  Confirm the ticket exists.
2.  Confirm the ticket belongs to the event being checked in.
3.  Confirm payment was successfully verified.
4.  Confirm the ticket is in a valid state.
5.  Confirm the ticket is not cancelled or refunded.
6.  Confirm the ticket has not already been checked in.
7.  Confirm the event currently allows entry.

### 9.3 Successful Verification

```text
✓ VALID TICKET

EVENT
Beach Vibes 2026

TICKET
VIP

ATTENDEE
John Doe

ENTRY APPROVED
```

Immediately after approval, the system creates the check-in record and the attendee becomes part of the event’s attendance count.

### 9.4 Duplicate Scan

```text
First scan: VALID → ENTRY APPROVED → CHECK-IN RECORDED
Second scan: TICKET ALREADY CHECKED IN → ENTRY DENIED
```

### 9.5 Backup Method: Ticket Number

#### Manual Ticket Verification

| **QR Fails** | **Enter Ticket \#** | **Find Ticket** | **Same Backend Validation** | **Valid / Used / Invalid** |
|--------------|---------------------|-----------------|-----------------------------|----------------------------|

The ticket number is not intended to be a second, weaker security path. It is simply a human-readable lookup key used when scanning is unavailable or fails. Both methods must enter the same validation and check-in logic.

### 9.6 Ticket Number Security

```text
Visible on ticket: EVT-8F4K7P

QR contains: Separate secure verification token / identifier
```

The QR should not expose unnecessary personal information and should not rely only on a predictable, human-readable ticket number.

### 9.7 Attendance Rules

```text
Tickets Sold 1,000
Checked In 742
Not Checked In 258
```

Tickets Sold, Tickets Remaining and Tickets Checked In must remain separate measures.

### 9.8 Multiple Entrance Devices

```text
Entrance A → Scanner 1
Entrance A → Scanner 2
Entrance B → Scanner 3
VIP Entrance → Scanner 4
```

All devices communicate with the same backend. The check-in operation must be designed so two scanners cannot both successfully admit the same ticket at the same time.

### 9.9 Check-in Record

Check-in record: ticket, event, timestamp, staff member, optional scanner/device.

## 10. Organizer Dashboard & Reporting

The operational control center for organizers.

### 10.1 Dashboard KPIs

| **Metric**      | **Example** |
|-----------------|-------------|
| Upcoming Events | 4           |
| Tickets Sold    | 2,450       |
| Checked In      | 1,830       |
| Remaining       | 550         |
| Revenue         | GH₵XXX      |

### 10.2 Event-Level View

```text
Summer Pool Party
Tickets Sold: 780
Tickets Remaining: 220
Checked In: 610
Not Checked In: 170
```

### 10.3 Sales Records

- Orders.
- Purchasers.
- Ticket type.
- Quantity.
- Payment status.
- Purchase date.
- Ticket number(s).

### 10.4 Attendance Records

```text
Ticket Number | Attendee | Type | Status | Time
EVT-001 | John Doe | VIP | Checked In | 7:42 PM
EVT-002 | Mary Doe | Regular| Checked In | 7:45 PM
EVT-003 | Peter Doe | VIP | Not Checked | —
```

## 11. Platform Administration

Central governance, moderation, monitoring and support.

### 11.1 Admin Capabilities

- Manage organizers.
- Approve, suspend or manage organizer status.
- Review and manage events.
- Approve / unpublish events according to platform policy.
- Monitor ticket sales and payments.
- Monitor refunds and check-ins.
- View reports and system activity.
- Manage platform settings.

### 11.2 Organizer Approval Workflow

```text
Organizer Registers → Account Created → Verification / Review → Organizer Approved → Organizer Can Publish Events
```

The platform can later define trusted-organizer rules that allow certain approved organizers to publish without manual review.

## 12. Data Model & Database Concept

The business entities that the future database design should be built around.

### 12.1 Major Entities

| **Entity**      | **Purpose**                                                              |
|-----------------|--------------------------------------------------------------------------|
| Organizers      | People or organizations that create and manage events.                   |
| Organizer Staff | Users who work under an organizer, including check-in personnel.         |
| Events          | The event itself, including schedule, venue and descriptive information. |
| Venues          | Location information associated with an event.                           |
| Ticket Types    | The different ticket offerings, prices, quantities and sales windows.    |
| Orders          | A customer purchase transaction.                                         |
| Tickets         | Individual admission credentials created from an order.                  |
| Payments        | Financial transaction records and payment status.                        |
| Check-ins       | Successful event-entry records.                                          |
| Notifications   | Records of messages sent through supported channels.                     |
| Audit Logs      | Security and operational history of important actions.                   |

### 12.2 Conceptual Relationships

```text
Organizer → Events → Ticket Types → Tickets
Organizer → Staff → Check-ins
Event → Orders → Payment
Order → Tickets
```

> **DESIGN REQUIREMENT**
>
> A formal ERD and detailed table/relationship design should be completed before implementation begins.

### 12.3 Customer Data Approach

Customers do not need to share the same account model as organizers. Their purchase information can be associated with orders and, where required, attendee records. A customer-account feature can be added later without redesigning the core order/ticket model.

## 13. Application & Technical Architecture

A scalable structure without unnecessary early complexity.

### 13.1 Recommended Initial Architecture

> **ARCHITECTURE DECISION**
>
> Use a modular monolithic architecture for the first production version rather than immediately splitting the system into microservices.

```text
PUBLIC WEBSITE
│
▼
APPLICATION / API
│
┌────┼───────────────┬───────────────┐
▼ ▼ ▼ ▼
EVENT TICKET ORDER PAYMENT
MODULE MODULE MODULE MODULE
└────┴───────────────┴──────┬────────┘
▼
DATABASE
│
┌─────────────────┼─────────────────┐
▼ ▼ ▼
NOTIFICATIONS FILE STORAGE CACHE / QUEUE
```

### 13.2 Check-in Module

```text
Phone Scanner
↓
Check-In Interface
↓
Application / API
↓
Ticket Validation
↓
Database
↓
Check-In Record
↓
Attendance Count
```

### 13.3 Core Application Modules

| **Module**              | **Primary responsibility**                              |
|-------------------------|---------------------------------------------------------|
| Authentication          | Login, session and account security.                    |
| Organizer Management    | Organizer profiles and status.                          |
| Event Management        | Event creation, editing, publishing and status.         |
| Venue Management        | Event venue and location information.                   |
| Ticket Management       | Ticket types, ticket identity and lifecycle.            |
| Inventory Management    | Availability, reservations and overselling protection.  |
| Order Management        | Customer purchase records.                              |
| Payment Management      | Payment status, verification and reconciliation.        |
| Ticket Verification     | QR and ticket-number lookup/validation.                 |
| Check-In Management     | Entry confirmation and attendance records.              |
| Notification Management | Email/SMS/WhatsApp orchestration.                       |
| Refund Management       | Refund state and history.                               |
| Reporting               | Sales, ticket and attendance reporting.                 |
| Administration          | Platform governance and moderation.                     |
| Audit / Security        | Audit trail, security controls and operational history. |

### 13.4 Public Application Areas

```text
Home · Events · Search · Event Details · Checkout · Payment Result · Ticket · Ticket Lookup
```

### 13.5 Organizer Application Areas

```text
Dashboard · Events · Create/Edit Event · Tickets · Orders · Attendees · Check-In · Reports · Staff · Settings
```

### 13.6 Check-In Interface

```text
--------------------------------
BEACH VIBES 2026

CHECK-IN

[ SCAN QR ]

OR

[ ENTER TICKET NUMBER ]

---------------------
Checked In: 742
--------------------------------
```

## 14. Security, Authorization & Audit

The security model required for money, tickets and admission control.

### 14.1 Authentication

- Secure password storage for organizers, staff and admins.
- Session management.
- Password reset.
- Email verification where appropriate.
- Rate limiting.
- Optional two-factor authentication.

### 14.2 Authorization

```text
Admin → Full platform access
Organizer → Only their resources
Check-in Staff → Only assigned events
```

### 14.3 Ticket Verification Security

```text
Ticket exists
↓
Correct event
↓
Valid payment
↓
Correct status
↓
Not refunded
↓
Not cancelled
↓
Not already checked in
↓
Check-in allowed
↓
Record successful check-in
```

The final check-in operation must be atomic so two scanners cannot both successfully admit the same ticket.

### 14.4 QR Data Protection

- Do not expose unnecessary personal information through the QR payload.
- Use a separate secure verification token/identifier rather than relying solely on a predictable ticket number.

### 14.5 Audit Logging

```text
Organizer created event
Organizer changed ticket price
Admin approved event
Admin cancelled event
Ticket refunded
Ticket checked in
Staff account created
Staff account disabled
```

## 15. Notifications, Refunds & Financial Operations

Supporting services that complete the commercial lifecycle.

### 15.1 Notifications

| **Channel** | **Possible notifications**                                                                                         |
|-------------|--------------------------------------------------------------------------------------------------------------------|
| Email       | Purchase confirmation, ticket delivery, payment failure, reminder, cancellation, postponement, refund confirmation |
| SMS         | Optional based on business requirements and cost.                                                                  |
| WhatsApp    | Optional based on business requirements and cost.                                                                  |

Notification handling should remain separate from core ticket and order logic so additional providers can be introduced later.

### 15.2 Financial Architecture

```text
Gross Ticket Sales → Payment Processing Fees → Platform Fees → Refunds → Organizer Amount
```

### 15.3 Refund Architecture

```text
PAID → REFUNDED
```

Refunded tickets should not disappear. Orders, payment records, ticket records and refund history should remain available for auditing and reporting.

### 15.4 Event Cancellation

```text
Event → CANCELLED
```

Cancellation should trigger the defined notification and refund workflow while preserving historical sales and ticket records.

### 15.5 Future Organizer Payouts

Payout functionality can be introduced later. The architecture should leave room for organizer balances, payout states and settlement reporting without forcing this feature into the first MVP.

## 16. Edge Cases & Reliability Rules

Situations that should be defined before development rather than handled ad hoc in production.

| **Scenario**                                 | **Required system behavior**                                                   |
|----------------------------------------------|--------------------------------------------------------------------------------|
| Payment succeeds but ticket generation fails | Provide recovery/reconciliation so the paid order is not lost.                 |
| Customer closes browser during payment       | Keep the order recoverable through payment verification.                       |
| Customer pays twice                          | Detect and handle duplicate payment safely.                                    |
| Customer loses ticket email                  | Provide a ticket recovery / lookup mechanism.                                  |
| QR does not scan                             | Use ticket-number backup verification.                                         |
| Ticket is scanned twice                      | First valid scan checks in; later attempts are rejected.                       |
| Two scanners scan same ticket simultaneously | Only one check-in should succeed.                                              |
| Event cancelled after sales                  | Follow the defined cancellation/refund policy.                                 |
| Event date changes                           | Notify customers and apply the organizer/platform policy for existing tickets. |
| Ticket inventory reaches zero                | Mark that ticket type unavailable; do not oversell.                            |

> **RELIABILITY PRINCIPLE**
>
> The platform should be designed so a failed browser session, duplicate request or simultaneous scanner action does not corrupt ticket inventory, payment state or attendance records.

## 17. MVP & Future Roadmap

What belongs in the first release and what should wait until the core platform is stable.

### 17.1 MVP — Phase 1

| **Area**  | **MVP scope**                                                                                                                         |
|-----------|---------------------------------------------------------------------------------------------------------------------------------------|
| Public    | Home, event browsing, search, event details, ticket selection, checkout, payment, ticket delivery                                     |
| Organizer | Registration/login, dashboard, create/edit event, ticket types/quantities, sales monitoring, attendee records                         |
| Ticket    | Individual ticket generation, unique ticket number, secure QR verification information, ticket status                                 |
| Entrance  | Check-in staff login, QR scanning, ticket-number fallback, validation, duplicate detection, attendance records, live attendance count |
| Admin     | Organizer management, event management, basic payment monitoring, basic platform reporting                                            |

### 17.2 Phase 2

- Advanced reports.
- Organizer staff management.
- Refund system.
- Event cancellation workflow.
- Promo codes and discounts.
- Event reminders.
- SMS and WhatsApp notifications.
- Better analytics.

### 17.3 Phase 3

```text
Organizer payouts · Offline check-in · Dedicated mobile application · Advanced fraud detection
Waitlists · Ticket transfer · Re-entry · Membership/subscription features · Advanced platform analytics
```

## 18. Core Data Flows

The four flows that explain the platform at a high level.

### 18.1 Flow A — Event

```text
Organizer → Create Event → Configure Tickets → Submit → Approve → Publish
```

### 18.2 Flow B — Purchase

```text
Customer → Select Event → Select Ticket → Checkout → Pay → Payment Verified → Tickets Generated
```

### 18.3 Flow C — Ticket Verification

```text
QR Scan
OR
Ticket Number
↓
Ticket Validation
↓
Valid?
↓
Yes
↓
Check-In
↓
Attendance +1
```

### 18.4 Flow D — Reporting

```text
Orders + Payments + Tickets + Check-ins → Reports → Organizer / Admin
```

## 19. Final Architecture Vision

The complete product structure in one view.

```text
EVENT PLATFORM
│
┌─────────────────────┼─────────────────────┐
│ │ │
CUSTOMER ORGANIZER ADMIN
│ │ │
Public Website Dashboard Dashboard
│ │ │
└─────────────────────┼─────────────────────┘
│
▼
APPLICATION / API
│
┌───────────────────────┼───────────────────────────┐
▼ ▼ ▼ ▼ ▼
EVENTS TICKETS ORDERS PAYMENTS CHECK-IN
│ │ │ │ │
└──────────┴────────────┴────────────┴──────────────┘
│
▼
DATABASE
│
┌─────────────┼─────────────┐
▼ ▼ ▼
EMAIL/SMS FILE STORAGE LOGGING
```

### 19.1 Check-In Architecture

```text
Event Entrance → QR Scan (PRIMARY) OR Ticket Number (BACKUP) → Same Ticket Validation → VALID / ALREADY USED / INVALID → Check-In Record → Attendance Count
```

> **ARCHITECTURE OUTCOME**
>
> The system remains simple enough to build and operate as one modular application, while the separation of business modules creates room for later scaling or service extraction if real usage eventually requires it.

## 20. Pre-Development Design Checklist

The planning artifacts that should be completed before the first production feature is built.

□ Complete functional requirements

□ Complete customer user journey

□ Complete organizer workflow

□ Complete admin workflow

□ Define ticket lifecycle

□ Define payment lifecycle

□ Define QR / ticket-number verification lifecycle

□ Define check-in lifecycle

□ Create formal database ERD

□ Define database tables and relationships

□ Create role and permission matrix

□ Define API/module boundaries

□ Define security architecture

□ Define error and edge-case handling

□ Define notification architecture

□ Define deployment architecture

□ Confirm MVP vs future-feature boundary

> **STOP / START RULE**
>
> Development should begin only after these design artifacts are reviewed and agreed. The goal is to implement an already-designed system rather than discover the architecture while coding.

### Final Core Principles

- Customers do not need accounts.
- Organizers, staff and admins require accounts.
- One order can contain multiple tickets.
- Every ticket is individually identifiable.
- QR code is the primary verification method.
- Ticket number is the backup verification method.
- QR and ticket-number verification must use the same backend validation rules.
- A successfully checked-in ticket cannot normally be checked in again.
- Attendance is based on successful check-ins, not ticket purchases.
- Payment must be verified by the backend.
- Ticket inventory must prevent overselling.
- Refunded/cancelled tickets remain in historical records.
- Organizer permissions must be isolated from other organizers.
- Check-in staff have restricted permissions.
- Important financial, administrative and check-in actions should be auditable.
- The first architecture should be modular and scalable without unnecessarily introducing microservices.

**SOURCE & DOCUMENT NOTE**

This Word document reorganizes and formats the previously developed Event Ticketing System product, system and architecture plan into a structured pre-development planning document. The content and terminology are based on the supplied plan, including the agreed QR-primary / ticket-number-backup verification rule.

> **NEXT DESIGN STAGE**
>
> The next planning artifact should detail the complete user journeys and business rules, then the ERD/database design, role-permission matrix, API/module boundaries, security model and deployment architecture.
