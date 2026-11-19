# Changelog

Entries are grouped by `APP_VERSION`. Releases are tagged `vX.Y.Z` on `main`. From now on, changelog entries are written in English.

## Unreleased

None.

## 2.4.1 - 2026-11-19

PATCH. `APP_VERSION` moves to `2.4.1`.

### Changed

- #710 Public-portfolio prep: removed personal and internal docs, added LICENSE, translated the changelog to English, and hardened CI secret handling.

## 2.4.0 - 2026-11-11

MINOR. `APP_VERSION` moves to `2.4.0`.

### Added

- #704 Read-only API and MCP: backtest journals and their trades, per-journal backtest statistics, and trading plans.
- #705 Read-only API and MCP: morning and evening journals, risk rules and breach status, and statistics grouped by session, setup, weekday, and hour.

### Changed

- #707 Design tokens and the design system, a home-page redesign, and Heebo 800.

## 2.3.1 - 2026-11-10

PATCH. `APP_VERSION` moves to `2.3.1`.

### Fixed

- #701 Removed the "professional guidance" heading that was left with no content on the analytics tab. The heading button and the guidance dialog are unchanged.

## 2.3.0 - 2026-11-10

MINOR after #655 (`be50d54`), through #696 (`8368220`). `APP_VERSION` moves to `2.3.0`. Checklist: `docs/RELEASE-CHECKLIST-next.md`.

### Added

- #657 Clearer rejection messages when connecting Bybit and MEXC. The read-only rule is unchanged.
- #658 A daily-loss banner on the journal. It does not block new entries.
- #659 #661 #662 #663 Sharing a live journal: field filtering, Worker endpoints, an owner dialog, and a read-only page.
- #665 #666 Tag and mistake statistics, and sub-tabs on the analytics screen.
- #667 #670 #676 Journal risk rules: calculated from closed trades, settings and a chip, and a banner that can be dismissed.
- #669 Economic-calendar filters, saved per user.
- #671 #675 Custom trade fields, including CSV and the API.
- #673 An onboarding tour on the app shell. It can be skipped.
- #679 #680 #682 An income and expenses page. `BUSINESS_LEDGER_FIRESTORE_ENABLED` is turned on after the `businessEntries` rules are published.
- #681 #683 #684 A notebook. `NOTEBOOK_FIRESTORE_ENABLED` is turned on after the `notebookEntries` rules are published.

### Changed

- #660 Documented how a release is approved and tagged (`docs/RELEASES.md`).
- #668 #692 Profile settings in a single column. #668 grouped the categories, #692 removed the side column.
- #677 The journal settings dialog is wider.
- #678 "Mentor mode" / "AI mentor" was renamed to "professional guidance". Routes, collections, and keys are unchanged.
- #690 Business-ledger labels are income and expenses.
- #694 Custom-field management moved to the trade form. Settings keeps a link to it.
- #696 Custom trade fields are available on every account, not only Premium. The limit stays 12 fields and a name of up to 40 characters. CSV, analytics, and the API were not gated.

### Fixed

- #664 The MEXC badge, and journal sharing moved to journal settings.
- #672 The economic calendar stays available when its source is missing.
- #674 Page content no longer sits under the notification banner.
- #685 Account deletion also removes KV keys for a shared journal.
- #686 Staging again serves the calendar, quotes, digest, and demo screens.
- #687 The sync line on the splash screen does not name exchanges.
- #688 Percent and R in the CSV export match the trades table.
- #689 In the notebook the selected tag is visible, and demo dates are in the past.
- #691 An unsaved trading plan is shown as a new plan.
- #693 A new notebook entry opens on the local day.
