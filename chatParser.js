class ChatParser {
  constructor() {
    this.members = new Map(); // Map of member identifier -> {name, phone, lastActive, messageCount}
    this.chatLines = [];
  }

  /**
   * Parse WhatsApp chat export file
   * @param {string} chatContent - The content of the chat export file
   */
  parseChatFile(chatContent) {
    this.chatLines = chatContent.split('\n');
    const messageRegex = /^(\d{2}\/\d{2}\/\d{4}),\s(\d{2}:\d{2})\s-\s(.+?):\s(.+)$/;
    const joinRegex = /^(\d{2}\/\d{2}\/\d{4}),\s(\d{2}:\d{2})\s-\s(.+?)\sjoined\susing/;
    const phoneRegex = /^\+?\d[\d\s-]+$/;

    for (const line of this.chatLines) {
      // Parse regular messages
      const messageMatch = line.match(messageRegex);
      if (messageMatch) {
        const [, date, time, sender, message] = messageMatch;
        const timestamp = this.parseDate(date, time);
        this.recordActivity(sender, timestamp);
        continue;
      }

      // Parse member joins
      const joinMatch = line.match(joinRegex);
      if (joinMatch) {
        const [, date, time, member] = joinMatch;
        const timestamp = this.parseDate(date, time);
        this.recordMember(member, timestamp);
      }
    }

    return this.members;
  }

  /**
   * Parse date and time string to Date object
   * @param {string} dateStr - Date in DD/MM/YYYY format
   * @param {string} timeStr - Time in HH:MM format
   */
  parseDate(dateStr, timeStr) {
    const [day, month, year] = dateStr.split('/');
    const [hours, minutes] = timeStr.split(':');
    return new Date(year, month - 1, day, hours, minutes);
  }

  /**
   * Record member activity
   * @param {string} identifier - Member name or phone number
   * @param {Date} timestamp - Activity timestamp
   */
  recordActivity(identifier, timestamp) {
    const cleanId = identifier.trim();

    if (!this.members.has(cleanId)) {
      this.recordMember(cleanId, timestamp);
    }

    const member = this.members.get(cleanId);

    // Update last active if this is more recent
    if (!member.lastActive || timestamp > member.lastActive) {
      member.lastActive = timestamp;
    }

    member.messageCount++;
  }

  /**
   * Record a new member
   * @param {string} identifier - Member name or phone number
   * @param {Date} joinDate - Date member joined
   */
  recordMember(identifier, joinDate) {
    const cleanId = identifier.trim();

    if (!this.members.has(cleanId)) {
      const isPhone = this.isPhoneNumber(cleanId);

      this.members.set(cleanId, {
        identifier: cleanId,
        name: isPhone ? null : cleanId,
        phone: isPhone ? this.normalizePhone(cleanId) : null,
        lastActive: joinDate,
        joinDate: joinDate,
        messageCount: 0,
        isPhoneOnly: isPhone
      });
    }
  }

  /**
   * Check if identifier is a phone number
   * @param {string} identifier - The identifier to check
   */
  isPhoneNumber(identifier) {
    // Match patterns like: +91 98765 43210, +91 9876543210, 9876543210, etc.
    const phonePattern = /^\+?\d[\d\s-]+$/;
    return phonePattern.test(identifier);
  }

  /**
   * Normalize phone number by removing spaces and dashes
   * @param {string} phone - Phone number to normalize
   */
  normalizePhone(phone) {
    return phone.replace(/[\s-]/g, '');
  }

  /**
   * Get inactive members based on months of inactivity
   * @param {number} months - Number of months to consider inactive
   * @returns {Array} Array of inactive member objects
   */
  getInactiveMembers(months) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);

    const inactiveMembers = [];

    for (const [identifier, member] of this.members) {
      // Skip system messages
      if (identifier.includes('Messages and calls are end-to-end encrypted') ||
          identifier.includes('created group') ||
          identifier.includes('changed')) {
        continue;
      }

      // Check if member is inactive
      if (!member.lastActive || member.lastActive < cutoffDate) {
        inactiveMembers.push({
          ...member,
          daysSinceActive: member.lastActive ?
            Math.floor((new Date() - member.lastActive) / (1000 * 60 * 60 * 24)) :
            null
        });
      }
    }

    return inactiveMembers.sort((a, b) => {
      // Sort by last active date (oldest first)
      if (!a.lastActive) return 1;
      if (!b.lastActive) return -1;
      return a.lastActive - b.lastActive;
    });
  }

  /**
   * Get all members
   * @returns {Array} Array of all member objects
   */
  getAllMembers() {
    const allMembers = [];

    for (const [identifier, member] of this.members) {
      // Skip system messages
      if (identifier.includes('Messages and calls are end-to-end encrypted') ||
          identifier.includes('created group') ||
          identifier.includes('changed')) {
        continue;
      }

      allMembers.push(member);
    }

    return allMembers;
  }

  /**
   * Export inactive members to text format
   * @param {Array} inactiveMembers - Array of inactive member objects
   * @returns {string} Text format of inactive members
   */
  exportToText(inactiveMembers) {
    let text = `WhatsApp Inactive Members Report\n`;
    text += `Generated: ${new Date().toLocaleString()}\n`;
    text += `Total Inactive Members: ${inactiveMembers.length}\n\n`;
    text += `${'='.repeat(60)}\n\n`;

    for (const member of inactiveMembers) {
      text += `Name: ${member.name || 'N/A'}\n`;
      text += `Phone: ${member.phone || 'N/A'}\n`;
      text += `Identifier: ${member.identifier}\n`;
      text += `Last Active: ${member.lastActive ? member.lastActive.toLocaleString() : 'Never'}\n`;
      text += `Days Since Active: ${member.daysSinceActive || 'N/A'}\n`;
      text += `Messages Sent: ${member.messageCount}\n`;
      text += `${'-'.repeat(60)}\n`;
    }

    return text;
  }

  /**
   * Try to match a WhatsApp Web member with chat export data
   * @param {string} webName - Name from WhatsApp Web
   * @param {string} webPhone - Phone from WhatsApp Web (if available)
   * @returns {object|null} Matched member or null
   */
  matchMember(webName, webPhone) {
    // Try exact phone match first (most reliable)
    if (webPhone) {
      const normalizedWebPhone = this.normalizePhone(webPhone);
      for (const [identifier, member] of this.members) {
        if (member.phone && this.normalizePhone(member.phone) === normalizedWebPhone) {
          return member;
        }
      }
    }

    // Try exact name match
    if (webName) {
      if (this.members.has(webName)) {
        return this.members.get(webName);
      }

      // Try partial name match
      const webNameLower = webName.toLowerCase();
      for (const [identifier, member] of this.members) {
        if (member.name) {
          const memberNameLower = member.name.toLowerCase();
          if (memberNameLower.includes(webNameLower) || webNameLower.includes(memberNameLower)) {
            return member;
          }
        }
      }
    }

    return null;
  }
}

// Make ChatParser available globally
if (typeof window !== 'undefined') {
  window.ChatParser = ChatParser;
}
