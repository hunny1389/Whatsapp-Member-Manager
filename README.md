# Whatsapp-Member-Manager
Find and Remove Inactive members


# WhatsApp Group Member Manager

A Chrome extension to help group admins manage inactive members in WhatsApp groups by analyzing chat history and automating member removal.

## Key Features

### Smart Member Verification
- **Automatically extracts current group members** from WhatsApp Web
- **Cross-references** with chat history to verify who's still in the group
- **Only attempts removal** of members currently in the group
- **Shows statistics** about members already removed/left
- **Smart matching** by phone number and name

### Member Management
- Parse WhatsApp chat export files to identify member activity
- Select inactivity threshold (3, 6, 12, or 18 months)
- Remove inactive members one-by-one with manual approval
- Skip any member you want to keep
- Stop anytime and export remaining list

### Safety & Reliability
- Manual approval required for each removal
- Export inactive member lists before removal
- Automatic failure handling with export after 3 consecutive failures
- No data sent to external servers (100% local)

## Installation

### Step 1: Download the Extension

All extension files are in the `whatsapp-member-manager` folder.

### Step 2: Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `whatsapp-member-manager` folder
5. The extension icon should appear in your Chrome toolbar

### Step 3: Create Icon Images (Optional)

The extension requires icons. You can:

**Option A: Use placeholder icons**
- Create three PNG files in the `icons` folder:
  - `icon16.png` (16x16 pixels)
  - `icon48.png` (48x48 pixels)
  - `icon128.png` (128x128 pixels)

**Option B: Generate icons online**
- Visit any icon generator website
- Create simple icons with "WM" or WhatsApp-style design
- Save them with the names above

## Usage

### Step 1: Export Your WhatsApp Group Chat

1. Open WhatsApp on your phone
2. Go to the group you want to manage
3. Tap the group name at the top
4. Scroll down and tap "Export chat"
5. Choose "Without media"
6. Save the `.txt` file to your computer

### Step 2: Open WhatsApp Web

1. Go to https://web.whatsapp.com
2. Scan the QR code with your phone to log in
3. Open the group you want to manage
4. Make sure you're an admin of the group

### Step 3: Use the Extension

1. Click the extension icon in Chrome toolbar
2. **Upload Chat Export**: Click "Choose File" and select your exported chat file
3. **Select Inactivity Period**: Choose how long (3, 6, 12, or 18 months) without messaging qualifies as "inactive"
4. **Analyze Members**: Click "Analyze Members" to see statistics
5. **Review**: See total, active, and inactive member counts
6. **Start Removal**: Click "Start Removal Process"
7. **Verification** (automatic): The extension will:
   - Extract current members from WhatsApp Web
   - Cross-reference with inactive members from chat export
   - Show you a confirmation with verification statistics
   - Display how many members already left/were removed
8. **Confirm & Proceed**: Review the verification statistics and click "OK" to continue
9. **Approve Each Removal**: For each verified inactive member:
   - Review their name and last activity
   - Click "Remove This Member" to remove them
   - Click "Skip This Member" to keep them
   - Click "Stop Process" to end early

### Features During Removal

- **Progress Tracking**: See which member you're on (e.g., "5 of 23")
- **Skip Members**: Choose to keep specific members even if inactive
- **Error Handling**: If 3 removals fail in a row, the extension automatically exports the remaining list
- **Stop Anytime**: Stop the process and export remaining members

### Exporting Lists

- **Export Inactive List**: Download a text file with all inactive members (before removal)
- **Failed Removals**: Automatically exported if 3 consecutive failures occur
- **Remaining Members**: Exported when you stop the process early

## Important Notes

### Safety & Ethics

- **Only use this on groups you admin**: You must be a group admin
- **Use responsibly**: Consider warning inactive members before removal
- **Backup your data**: Keep the chat export file
- **WhatsApp Terms**: This extension automates WhatsApp Web. Use at your own discretion

### Technical Limitations

- **Rate Limiting**: WhatsApp may temporarily block actions if too many removals occur quickly
- **DOM Changes**: WhatsApp Web updates may break the extension (selectors may need updates)
- **Manual Approval**: Each removal requires manual approval for safety
- **Matching**: Members are matched by name and phone number when possible

### Troubleshooting

**"Please open WhatsApp Web in the current tab first"**
- Make sure you're on web.whatsapp.com
- Refresh the page and try again

**"Please open a group chat on WhatsApp Web first"**
- Click on a group chat in WhatsApp Web
- Make sure it's a group, not an individual chat

**"Member not found in the list"**
- The member may have left the group
- Their name may have changed
- Try skipping and continue with others

**"Remove button not found"**
- WhatsApp Web may have updated its interface
- The extension's selectors may need updating
- Try refreshing WhatsApp Web

**Removal fails repeatedly**
- WhatsApp may be rate-limiting your actions
- Wait 5-10 minutes and try again
- After 3 failures, a text file with remaining members is automatically downloaded

## File Structure

```
whatsapp-member-manager/
├── manifest.json          # Extension configuration
├── popup.html            # Extension popup UI
├── popup.js             # Popup logic and coordination
├── styles.css           # UI styling
├── chatParser.js        # Chat file parser
├── content.js           # WhatsApp Web interaction
├── background.js        # Service worker
├── README.md           # This file
└── icons/              # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Privacy

This extension:
- **Does NOT** send any data to external servers
- **Does NOT** store chat content
- **Only processes** data locally in your browser
- **Only interacts** with WhatsApp Web in the current tab

## Support

If you encounter issues:

1. Check that you're using the latest version of Chrome
2. Verify you're an admin of the group
3. Try refreshing WhatsApp Web
4. Check the browser console for errors (F12 → Console)

## Disclaimer

This extension is provided as-is. The author is not responsible for:
- Any violations of WhatsApp's Terms of Service
- Account bans or restrictions
- Data loss or group management issues
- Any other consequences of using this extension

Use this tool responsibly and at your own risk.

## Version

Current version: 1.3.2

## License

This extension is provided for personal use. Feel free to modify as needed.
