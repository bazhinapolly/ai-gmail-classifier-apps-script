# Portfolio Case Study: AI Gmail Email Classifier

## Overview

Built a Google Apps Script automation concept that classifies incoming Gmail messages with OpenAI and applies operational labels automatically.

The goal is to reduce manual inbox triage for small business teams by routing unread emails into categories such as invoices, orders, complaints, quote requests, marketing, internal communication, and other.

## Problem

Business inboxes often contain mixed email types: invoices, customer questions, complaints, internal messages, order updates, newsletters, and quote requests. Without automation, someone has to manually scan and sort messages before the right person can act.

## Solution

The script runs every 5 minutes, reads unread inbox emails, sends the subject, sender, and a short body snippet to OpenAI, receives a structured JSON classification, and applies the matching Gmail label.

To make the workflow safer and easier to maintain, the system includes:

- Configurable categories at the top of the script
- OpenAI API key stored in Script Properties
- Batch processing to stay within Apps Script limits
- A processed label to avoid duplicate classification
- A fallback label for low-confidence results
- Google Sheets error logging
- Setup instructions for deployment

## Tools Used

- Google Apps Script
- GmailApp
- SpreadsheetApp
- OpenAI Chat Completions API
- Gmail Labels
- Time-driven triggers

## Key Features

- Automatic email classification
- Configurable category list
- Gmail label assignment
- Processed-email marker
- Low-confidence fallback category
- Error log spreadsheet
- Maintainable setup documentation

## Business Value

This workflow helps teams reduce manual email sorting and respond faster to important messages. It is especially useful for service businesses, agencies, e-commerce teams, and operations inboxes where email routing affects response time.

## Notes

This is a portfolio demo built with production-style patterns. It can be adapted into a real client workflow by connecting the client's Gmail account, category list, OpenAI key, and preferred error log spreadsheet.
