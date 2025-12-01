// Popup script for WhatsApp Member Manager

class MemberManager {
  constructor() {
    this.parser = new ChatParser();
    this.inactiveMembers = [];
    this.currentGroupMembers = []; // Current members from WhatsApp Web
    this.verifiedInactiveMembers = []; // Inactive members who are still in group
    this.currentIndex = 0;
    this.failedRemovals = [];
    this.consecutiveFailures = 0;
    this.skippedMembers = [];
    this.groupName = ''; // Group name from WhatsApp Web
    this.exportDate = ''; // Date when members were scanned

    this.initializeElements();
    this.attachEventListeners();
  }

  /**
   * Get the active tab
   */
  async getActiveTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(tabs && tabs.length ? tabs[0] : null);
      });
    });
  }

  /**
   * Inject content script dynamically into the current tab
   */
  async ensureContentScript() {
    const tab = await this.getActiveTab();
    if (!tab?.id) {
      throw new Error('No active tab found');
    }

    if (!tab.url.includes('web.whatsapp.com')) {
      throw new Error('Please open WhatsApp Web first');
    }

    try {
      // Inject content script dynamically
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      return tab;
    } catch (error) {
      console.error('Failed to inject content script:', error);
      throw new Error('Failed to load content script: ' + error.message);
    }
  }

  /**
   * Send message to tab and get response
   */
  async sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  initializeElements() {
    // Step 1 elements
    this.chatFileInput = document.getElementById('chatFile');
    this.fileStatus = document.getElementById('fileStatus');

    // Step 2 elements
    this.inactivityPeriod = document.getElementById('inactivityPeriod');
    this.scanMembersBtn = document.getElementById('scanMembersBtn');
    this.loadMembersBtn = document.getElementById('loadMembersBtn');
    this.activeMembersFileInput = document.getElementById('activeMembersFile');
    this.loadedFileInfo = document.getElementById('loadedFileInfo');
    this.step2Status = document.getElementById('step2Status');
    this.analyzeBtn = document.getElementById('analyzeBtn');

    // Step 3 elements
    this.totalMembersSpan = document.getElementById('totalMembers');
    this.activeMembersSpan = document.getElementById('activeMembers');
    this.inactiveMembersSpan = document.getElementById('inactiveMembers');
    this.startRemovalBtn = document.getElementById('startRemovalBtn');
    this.exportListBtn = document.getElementById('exportListBtn');
    this.exportActiveMembersBtn = document.getElementById('exportActiveMembersBtn');

    // Step 4 elements
    this.memberName = document.getElementById('memberName');
    this.memberLastActive = document.getElementById('memberLastActive');
    this.removalProgress = document.getElementById('removalProgress');
    this.removeBtn = document.getElementById('removeBtn');
    this.skipBtn = document.getElementById('skipBtn');
    this.stopBtn = document.getElementById('stopBtn');
    this.removalStatus = document.getElementById('removalStatus');
    this.errorLog = document.getElementById('errorLog');

    // Loading overlay
    this.loadingOverlay = document.getElementById('loadingOverlay');
    this.loadingText = document.getElementById('loadingText');

    // Steps
    this.steps = {
      step1: document.getElementById('step1'),
      step2: document.getElementById('step2'),
      step3: document.getElementById('step3'),
      step4: document.getElementById('step4')
    };
  }

  attachEventListeners() {
    this.chatFileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    this.scanMembersBtn.addEventListener('click', () => this.scanActiveMembers());
    this.loadMembersBtn.addEventListener('click', () => this.activeMembersFileInput.click());
    this.activeMembersFileInput.addEventListener('change', (e) => this.loadActiveMembersFromFile(e));
    this.analyzeBtn.addEventListener('click', () => this.analyzeMembers());
    this.startRemovalBtn.addEventListener('click', () => this.startRemovalProcess());
    this.exportListBtn.addEventListener('click', () => this.exportInactiveList());
    this.exportActiveMembersBtn.addEventListener('click', () => this.saveActiveMembersToJson());
    this.removeBtn.addEventListener('click', () => this.removeCurrentMember());
    this.skipBtn.addEventListener('click', () => this.skipCurrentMember());
    this.stopBtn.addEventListener('click', () => this.stopRemovalProcess());
  }

  showStep(stepNumber) {
    Object.values(this.steps).forEach(step => step.classList.add('hidden'));
    this.steps[`step${stepNumber}`].classList.remove('hidden');
  }

  showLoading(text = 'Processing...') {
    this.loadingText.textContent = text;
    this.loadingOverlay.classList.remove('hidden');
  }

  hideLoading() {
    this.loadingOverlay.classList.add('hidden');
  }

  showStatus(element, message, type) {
    element.textContent = message;
    element.className = `status ${type}`;
    element.style.display = 'block';
  }

  async handleFileUpload(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    this.showLoading('Reading chat file...');

    try {
      const content = await this.readFileAsText(file);
      this.parser.parseChatFile(content);

      const allMembers = this.parser.getAllMembers();

      this.showStatus(
        this.fileStatus,
        `Chat file loaded successfully! Found ${allMembers.length} members.`,
        'success'
      );

      // Move to step 2
      setTimeout(() => {
        this.showStep(2);
      }, 1000);

    } catch (error) {
      this.showStatus(
        this.fileStatus,
        `Error reading file: ${error.message}`,
        'error'
      );
    } finally {
      this.hideLoading();
    }
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * Scan active members from WhatsApp Web
   */
  async scanActiveMembers() {
    this.showLoading('Injecting content script...');

    try {
      // Inject content script and get tab
      const tab = await this.ensureContentScript();

      // Verify we're on a group chat
      this.showLoading('Checking group chat...');
      const checkResponse = await this.sendMessageToTab(tab.id, { action: 'checkPage' });

      if (!checkResponse.success || !checkResponse.isGroupChat) {
        alert('Please open the group chat on WhatsApp Web first!\n\nMake sure you click on the group in WhatsApp Web before scanning.');
        this.hideLoading();
        return;
      }

      // Extract current members from WhatsApp Web
      this.showLoading('Extracting current members from WhatsApp Web...');
      const membersResponse = await this.sendMessageToTab(tab.id, { action: 'extractMembers' });

      if (!membersResponse.success) {
        alert(`Failed to extract current group members: ${membersResponse.error}\n\nPlease make sure:\n1. You're on a group chat page\n2. The group info is accessible`);
        this.hideLoading();
        return;
      }

      this.currentGroupMembers = membersResponse.members;

      // Get the group name
      const groupNameResponse = await this.sendMessageToTab(tab.id, { action: 'getGroupName' });
      this.groupName = groupNameResponse.success ? groupNameResponse.groupName : 'Unknown Group';

      // Store export date
      this.exportDate = new Date().toISOString();

      this.hideLoading();

      // Show success message with group name
      this.showStatus(
        this.step2Status,
        `✓ Successfully scanned ${this.currentGroupMembers.length} members from "${this.groupName}"`,
        'success'
      );

      // Enable analyze button
      this.analyzeBtn.disabled = false;

      // Prompt user to save the active members list
      setTimeout(() => {
        const save = confirm(
          `Active members scanned successfully!\n\n` +
          `Total members: ${this.currentGroupMembers.length}\n\n` +
          `Would you like to save this list to avoid re-scanning next time?`
        );

        if (save) {
          this.saveActiveMembersToJson();
        }
      }, 500);

    } catch (error) {
      this.hideLoading();
      alert(`Error scanning members: ${error.message}\n\nMake sure WhatsApp Web is fully loaded.`);
    }
  }

  /**
   * Load active members from JSON file
   */
  async loadActiveMembersFromFile(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    this.showLoading('Loading active members from file...');

    try {
      const content = await this.readFileAsText(file);
      const data = JSON.parse(content);

      // Validate JSON structure
      if (!data.members || !Array.isArray(data.members)) {
        throw new Error('Invalid JSON format. Expected "members" array.');
      }

      this.currentGroupMembers = data.members;
      this.groupName = data.groupName || 'Unknown Group';
      this.exportDate = data.exportDate || '';

      this.hideLoading();

      // Show loaded file info
      const exportDateFormatted = data.exportDate ? new Date(data.exportDate).toLocaleString() : 'Unknown';
      this.showStatus(
        this.loadedFileInfo,
        `✓ Loaded ${this.currentGroupMembers.length} members from file\nGroup: ${this.groupName}\nExported: ${exportDateFormatted}`,
        'success'
      );

      this.showStatus(
        this.step2Status,
        `✓ Active members loaded: ${this.currentGroupMembers.length} members from "${this.groupName}"`,
        'success'
      );

      // Enable analyze button
      this.analyzeBtn.disabled = false;

    } catch (error) {
      this.hideLoading();
      alert(`Error loading file: ${error.message}\n\nPlease make sure the file is a valid JSON export.`);
    }
  }

  /**
   * Save active members to JSON file
   */
  saveActiveMembersToJson() {
    // Use stored export date or create new one
    const exportDateISO = this.exportDate || new Date().toISOString();
    const exportDateObj = new Date(exportDateISO);

    const data = {
      exportDate: exportDateISO,
      groupName: this.groupName || 'Unknown Group',
      exportDateFormatted: exportDateObj.toLocaleString(),
      totalMembers: this.currentGroupMembers.length,
      members: this.currentGroupMembers
    };

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Create filename with sanitized group name
    const sanitizedGroupName = this.groupName
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .substring(0, 30);
    const dateStr = exportDateObj.toISOString().split('T')[0];

    const a = document.createElement('a');
    a.href = url;
    a.download = `active_members_${sanitizedGroupName}_${dateStr}.json`;
    a.click();

    URL.revokeObjectURL(url);

    alert(`Active members list saved successfully!\n\nGroup: ${this.groupName}\nMembers: ${this.currentGroupMembers.length}\nDate: ${exportDateObj.toLocaleString()}`);
  }

  /**
   * Analyze inactive members (requires currentGroupMembers to be loaded)
   */
  async analyzeMembers() {
    if (!this.currentGroupMembers || this.currentGroupMembers.length === 0) {
      alert('Please scan or load active members first!');
      return;
    }

    this.showLoading('Analyzing inactive members...');

    try {
      const months = parseInt(this.inactivityPeriod.value);
      this.inactiveMembers = this.parser.getInactiveMembers(months);

      // Cross-reference with current group members
      this.verifiedInactiveMembers = this.verifyInactiveMembers();

      // Calculate statistics based on CURRENT group members
      const currentMemberCount = this.currentGroupMembers.length;
      const inactiveCount = this.verifiedInactiveMembers.length;
      const activeCount = currentMemberCount - inactiveCount;

      // Update display with VERIFIED numbers
      this.totalMembersSpan.textContent = currentMemberCount;
      this.activeMembersSpan.textContent = activeCount;
      this.inactiveMembersSpan.textContent = inactiveCount;

      this.hideLoading();

      // Move to step 3
      setTimeout(() => {
        this.showStep(3);
      }, 500);

    } catch (error) {
      this.hideLoading();
      alert(`Error analyzing members: ${error.message}`);
    }
  }

  async startRemovalProcess() {
    // Verify we have verified members ready
    if (!this.verifiedInactiveMembers || this.verifiedInactiveMembers.length === 0) {
      alert('No verified inactive members to remove.\n\nThis could mean:\n- All inactive members have already left the group\n- No members meet the inactivity criteria\n- Please run "Analyze Members" again');
      return;
    }

    try {
      // Ensure content script is still injected
      const tab = await this.ensureContentScript();

      // Verify we're still on the group chat
      const checkResponse = await this.sendMessageToTab(tab.id, { action: 'checkPage' });

      if (!checkResponse.success || !checkResponse.isGroupChat) {
        alert('Please make sure the group chat is still open on WhatsApp Web!');
        return;
      }

      // Show final confirmation
      const confirmMessage = `Ready to start removing ${this.verifiedInactiveMembers.length} inactive members.\n\n` +
        `You will approve each removal individually.\n\n` +
        `Continue?`;

      if (!confirm(confirmMessage)) {
        return;
      }

      // Reset state
      this.currentIndex = 0;
      this.failedRemovals = [];
      this.consecutiveFailures = 0;
      this.skippedMembers = [];

      // Move to step 4
      this.showStep(4);
      this.displayCurrentMember();

    } catch (error) {
      alert(`Error: ${error.message}\n\nPlease make sure WhatsApp Web is still loaded.`);
    }
  }

  /**
   * Verify which inactive members are still in the current group
   */
  verifyInactiveMembers() {
    const verified = [];

    for (const inactiveMember of this.inactiveMembers) {
      // Try to find this member in the current group
      const found = this.currentGroupMembers.find(currentMember => {
        // Match by phone number (most reliable)
        if (inactiveMember.phone && currentMember.phone) {
          const normalizedInactive = this.parser.normalizePhone(inactiveMember.phone);
          const normalizedCurrent = this.parser.normalizePhone(currentMember.phone);
          if (normalizedInactive === normalizedCurrent) {
            return true;
          }
        }

        // Match by name
        if (inactiveMember.name && currentMember.name) {
          // Exact match
          if (inactiveMember.name === currentMember.name) {
            return true;
          }

          // Partial match (case insensitive)
          const inactiveLower = inactiveMember.name.toLowerCase();
          const currentLower = currentMember.name.toLowerCase();
          if (inactiveLower.includes(currentLower) || currentLower.includes(inactiveLower)) {
            return true;
          }
        }

        // If inactive member only has identifier, try matching that
        if (!inactiveMember.name && !inactiveMember.phone) {
          if (currentMember.name === inactiveMember.identifier ||
              (currentMember.phone && currentMember.phone.includes(inactiveMember.identifier))) {
            return true;
          }
        }

        return false;
      });

      if (found) {
        verified.push({
          ...inactiveMember,
          currentName: found.name, // Store current name for more accurate removal
          currentPhone: found.phone
        });
      }
    }

    return verified;
  }

  displayCurrentMember() {
    if (this.currentIndex >= this.verifiedInactiveMembers.length) {
      this.completionMessage();
      return;
    }

    const member = this.verifiedInactiveMembers[this.currentIndex];

    // Show both historical and current name if different
    let displayName = member.currentName || member.name || member.phone || member.identifier;
    if (member.currentName && member.name && member.currentName !== member.name) {
      displayName = `${member.currentName} (was: ${member.name})`;
    }

    this.memberName.textContent = displayName;

    if (member.lastActive) {
      this.memberLastActive.textContent = `${member.lastActive.toLocaleDateString()} (${member.daysSinceActive} days ago)`;
    } else {
      this.memberLastActive.textContent = 'Never messaged';
    }

    this.removalProgress.textContent = `${this.currentIndex + 1} of ${this.verifiedInactiveMembers.length}`;

    // Clear status
    this.removalStatus.style.display = 'none';
  }

  async removeCurrentMember() {
    const member = this.verifiedInactiveMembers[this.currentIndex];

    this.removeBtn.disabled = true;
    this.skipBtn.disabled = true;
    this.showLoading('Removing member...');

    try {
      // Ensure content script is still injected
      const tab = await this.ensureContentScript();

      // Use current name/phone for more accurate matching
      const response = await this.sendMessageToTab(tab.id, {
        action: 'removeMember',
        memberName: member.currentName || member.name || member.identifier,
        memberPhone: member.currentPhone || member.phone
      });

      if (response.success) {
        this.showStatus(
          this.removalStatus,
          `Successfully removed: ${member.currentName || member.name || member.phone || member.identifier}`,
          'success'
        );

        this.consecutiveFailures = 0;

        // Move to next member after delay
        setTimeout(() => {
          this.currentIndex++;
          this.displayCurrentMember();
        }, 2000);

      } else {
        this.handleRemovalFailure(member, response.error);
      }

    } catch (error) {
      this.handleRemovalFailure(member, error.message);
    } finally {
      this.hideLoading();
      this.removeBtn.disabled = false;
      this.skipBtn.disabled = false;
    }
  }

  handleRemovalFailure(member, errorMessage) {
    this.consecutiveFailures++;
    this.failedRemovals.push({
      member: member,
      error: errorMessage,
      timestamp: new Date()
    });

    this.showStatus(
      this.removalStatus,
      `Failed to remove: ${errorMessage}`,
      'error'
    );

    // Add to error log
    this.addToErrorLog(`Failed: ${member.name || member.phone || member.identifier} - ${errorMessage}`);

    // Check if we've hit 3 consecutive failures
    if (this.consecutiveFailures >= 3) {
      this.exportFailedRemovals();
      alert('3 consecutive failures detected. Remaining members have been exported to a text file.');
      this.completionMessage();
    } else {
      // Move to next member after delay
      setTimeout(() => {
        this.currentIndex++;
        this.displayCurrentMember();
      }, 2000);
    }
  }

  skipCurrentMember() {
    const member = this.verifiedInactiveMembers[this.currentIndex];
    this.skippedMembers.push(member);

    this.showStatus(
      this.removalStatus,
      `Skipped: ${member.currentName || member.name || member.phone || member.identifier}`,
      'info'
    );

    setTimeout(() => {
      this.currentIndex++;
      this.displayCurrentMember();
    }, 1000);
  }

  stopRemovalProcess() {
    if (confirm('Are you sure you want to stop the removal process?')) {
      this.exportRemainingMembers();
      this.completionMessage();
    }
  }

  addToErrorLog(message) {
    this.errorLog.classList.remove('hidden');
    const p = document.createElement('p');
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.errorLog.appendChild(p);
  }

  async completionMessage() {
    this.removeBtn.style.display = 'none';
    this.skipBtn.style.display = 'none';
    this.stopBtn.style.display = 'none';

    const totalProcessed = this.currentIndex;
    const successful = totalProcessed - this.failedRemovals.length - this.skippedMembers.length;

    // Close the members modal in WhatsApp Web
    try {
      const tab = await this.ensureContentScript();
      await this.sendMessageToTab(tab.id, { action: 'closeModal' });
    } catch (error) {
      console.error('Error closing modal:', error);
    }

    this.showStatus(
      this.removalStatus,
      `Process completed!\n\nTotal Processed: ${totalProcessed}\nSuccessfully Removed: ${successful}\nFailed: ${this.failedRemovals.length}\nSkipped: ${this.skippedMembers.length}`,
      'success'
    );

    this.memberName.textContent = 'Process Complete';
    this.memberLastActive.textContent = '';
    this.removalProgress.textContent = `${totalProcessed} of ${this.inactiveMembers.length}`;
  }

  exportInactiveList() {
    const text = this.parser.exportToText(this.inactiveMembers);
    this.downloadTextFile(text, 'inactive_members.txt');
  }

  exportFailedRemovals() {
    let text = `Failed Member Removals\n`;
    text += `Generated: ${new Date().toLocaleString()}\n`;
    text += `Total Failed: ${this.failedRemovals.length}\n\n`;
    text += `${'='.repeat(60)}\n\n`;

    // Add remaining members that weren't processed
    const remaining = this.verifiedInactiveMembers.slice(this.currentIndex);

    text += `Remaining Members to Process:\n\n`;
    for (const member of remaining) {
      const displayName = member.currentName || member.name || member.phone || member.identifier;
      text += `${displayName}\n`;
      if (member.currentPhone || member.phone) text += `Phone: ${member.currentPhone || member.phone}\n`;
      text += `${'-'.repeat(40)}\n`;
    }

    text += `\n\nFailed Removals:\n\n`;
    for (const failed of this.failedRemovals) {
      const displayName = failed.member.currentName || failed.member.name || failed.member.phone || failed.member.identifier;
      text += `Name: ${displayName}\n`;
      if (failed.member.currentPhone || failed.member.phone) text += `Phone: ${failed.member.currentPhone || failed.member.phone}\n`;
      text += `Error: ${failed.error}\n`;
      text += `${'-'.repeat(40)}\n`;
    }

    this.downloadTextFile(text, 'failed_removals.txt');
  }

  exportRemainingMembers() {
    const remaining = this.verifiedInactiveMembers.slice(this.currentIndex);

    let text = `Remaining Inactive Members\n`;
    text += `Generated: ${new Date().toLocaleString()}\n`;
    text += `Total Remaining: ${remaining.length}\n\n`;
    text += `${'='.repeat(60)}\n\n`;

    for (const member of remaining) {
      const displayName = member.currentName || member.name || member.phone || member.identifier;
      text += `${displayName}\n`;
      if (member.currentPhone || member.phone) text += `Phone: ${member.currentPhone || member.phone}\n`;
      text += `${'-'.repeat(40)}\n`;
    }

    this.downloadTextFile(text, 'remaining_members.txt');
  }

  downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Initialize the manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new MemberManager();
});
