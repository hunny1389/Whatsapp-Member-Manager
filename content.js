// Content script for WhatsApp Web interaction

// Prevent re-injection
if (typeof window.whatsappController !== 'undefined') {
  console.log('WhatsApp Member Manager: Content script already loaded, skipping...');
} else {

class WhatsAppController {
  constructor() {
    this.selectors = {
      // Updated selectors for WhatsApp Web (current as of 2024)
      groupInfo: 'header',
      groupInfoButton: 'header div[role="button"][data-tab]',
      participantsSection: 'div[role="application"]',
      participantsList: '[role="listitem"]',
      participantName: '[dir="auto"]',
      searchBox: 'button[aria-label="Search"]',
      removeButton: 'li[role="menuitem"]',
      confirmButton: 'button[aria-label="OK"]',
      closeButton: 'button[aria-label*="Close"]'
    };

    this.waitTime = 2000; // Wait time between actions (ms)
  }

  /**
   * Better phone number detection (from working extension)
   */
  isProbablyPhone(value) {
    if (!value) return false;
    const cleaned = value.replace(/\s+/g, "").replace(/^[+]/, "");
    const hasDigits = /\d/.test(cleaned);
    const hasLetters = /[a-zA-Z]/.test(cleaned);
    return hasDigits && !hasLetters && cleaned.length >= 6;
  }

  /**
   * Wait for an element to appear in the DOM
   */
  async waitForElement(selector, timeout = 10000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
      await this.sleep(100);
    }

    throw new Error(`Element not found: ${selector}`);
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Click an element with retry logic
   */
  async clickElement(element, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        if (element && typeof element.click === 'function') {
          element.click();
          await this.sleep(500);
          return true;
        }
      } catch (error) {
        if (i === retries - 1) throw error;
        await this.sleep(1000);
      }
    }
    return false;
  }

  /**
   * Open group info panel
   */
  async openGroupInfo() {
    try {
      // Click on group header to open info
      const headerButton = await this.waitForElement(this.selectors.groupInfoButton);
      await this.clickElement(headerButton);
      await this.sleep(this.waitTime);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Extract total member count from group info
   */
  extractTotalMemberCount() {
    try {
      // Look for text patterns like "1,234 members" or "View all (1,000 more)"
      const buttons = document.querySelectorAll('div[role="button"]');

      for (const button of buttons) {
        const text = button.textContent;

        // Pattern: "View all (1,000 more)"
        const viewAllMatch = text.match(/View all \(([0-9,]+) more\)/);
        if (viewAllMatch) {
          const count = parseInt(viewAllMatch[1].replace(/,/g, ''));
          console.log('Found member count from "View all" button:', count);
          return count;
        }

        // Pattern: "1,234 members"
        const membersMatch = text.match(/([0-9,]+)\s+members?/i);
        if (membersMatch) {
          const count = parseInt(membersMatch[1].replace(/,/g, ''));
          console.log('Found member count from text:', count);
          return count;
        }
      }

      // Also check header subtitle
      const headerSubtitles = document.querySelectorAll('span[dir="auto"]');
      for (const span of headerSubtitles) {
        const text = span.textContent;
        const match = text.match(/([0-9,]+)\s+members?/i);
        if (match) {
          const count = parseInt(match[1].replace(/,/g, ''));
          console.log('Found member count from header:', count);
          return count;
        }
      }

      return null;
    } catch (error) {
      console.error('Error extracting member count:', error);
      return null;
    }
  }

  /**
   * Click "View all" button to open members modal
   */
  async openMembersModal() {
    try {
      // Look for "View all" button
      const buttons = document.querySelectorAll('div[role="button"]');
      let viewAllButton = null;

      for (const button of buttons) {
        if (button.textContent.includes('View all')) {
          viewAllButton = button;
          break;
        }
      }

      if (!viewAllButton) {
        return { success: false, error: 'View all button not found' };
      }

      await this.clickElement(viewAllButton);
      await this.sleep(this.waitTime);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Extract all group members
   */
  async extractMembers() {
    try {
      console.log('Starting member extraction...');

      // Open group info if not already open
      const openResult = await this.openGroupInfo();
      console.log('Open group info result:', openResult);

      if (!openResult.success) {
        return { success: false, error: 'Failed to open group info: ' + openResult.error };
      }

      // Wait for group info panel to load
      await this.sleep(this.waitTime);

      // Extract expected member count BEFORE opening modal
      const expectedCount = this.extractTotalMemberCount();
      if (expectedCount) {
        console.log('✓ Expected total members from group info:', expectedCount);
      } else {
        console.warn('⚠ Could not extract expected member count');
      }

      // Click "View all" to open members modal
      console.log('Attempting to open members modal...');
      const modalResult = await this.openMembersModal();

      if (!modalResult.success) {
        return { success: false, error: 'Failed to open members modal: ' + modalResult.error };
      }

      // Wait for modal to fully load
      await this.sleep(this.waitTime + 1000); // Extra delay for modal

      // Find the scrollable container - look for the one with xupqr0c class that's scrollable
      let scrollContainer = null;
      const potentialContainers = document.querySelectorAll('div.xupqr0c');

      for (const container of potentialContainers) {
        const style = window.getComputedStyle(container);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            container.scrollHeight > container.clientHeight) {
          scrollContainer = container;
          console.log('✓ Found scrollable container with height:', container.scrollHeight);
          break;
        }
      }

      console.log('Scroll container found:', !!scrollContainer);

      const participants = new Map(); // Use Map to avoid duplicates

      if (scrollContainer) {
        console.log('🔄 Starting to scroll through members list...');
        console.log('Initial scroll height:', scrollContainer.scrollHeight);

        let lastMemberCount = 0;
        let noChangeCount = 0;
        let scrollIteration = 0;
        const maxNoChange = 25; // Even more patient (working extension uses 20)

        // Scroll through the virtualized list to load all members
        while (noChangeCount < maxNoChange) {
          scrollIteration++;
          console.log(`\n--- Scroll iteration #${scrollIteration} ---`);

          // Extract currently visible members
          const memberElements = document.querySelectorAll('._ak8l');
          console.log('Visible member elements in DOM:', memberElements.length);

          let newMembersThisRound = 0;
          let skippedThisRound = 0;

          for (const element of memberElements) {
            try {
              // IMPROVED EXTRACTION (based on working extension)
              // Step 1: Look in primary container div._ak8q
              const primaryContainer = element.querySelector("div._ak8q") || element;
              const primarySpan =
                primaryContainer.querySelector("span[title]") ||
                primaryContainer.querySelector("span[dir='auto']");

              let phone = "";
              let displayName = "";

              if (primarySpan) {
                const titleValue = primarySpan.getAttribute("title") || "";
                const textValue = (primarySpan.textContent || "").trim();
                const phoneCandidate = titleValue || textValue;

                // Use improved phone detection
                const isPhone = this.isProbablyPhone(phoneCandidate);

                if (isPhone) {
                  phone = phoneCandidate.trim();
                  if (textValue && textValue !== phone) {
                    displayName = textValue;
                  }
                } else {
                  displayName = (titleValue || textValue).trim();
                }
              }

              // Step 2: If no phone found, search ALL spans in the element
              if (!phone) {
                const candidates = Array.from(
                  element.querySelectorAll("span[dir='auto'], span[title]")
                );

                for (const span of candidates) {
                  if (span === primarySpan) continue;

                  const candTitle = span.getAttribute("title") || "";
                  const candText = (span.textContent || "").trim();
                  const candValue = candTitle || candText;

                  if (!candValue) continue;
                  if (!this.isProbablyPhone(candValue)) continue;

                  phone = candValue.trim();
                  break;
                }
              }

              // Require at least phone OR displayName
              if (!phone && !displayName) {
                skippedThisRound++;
                continue;
              }

              const name = displayName || phone;

              if (scrollIteration <= 3) {
                console.log(`✓ Member: "${name}" ${phone ? `| Phone: "${phone}"` : '| No phone'}`);
              }

              // Use unique key: phone|displayName (like working extension)
              const key = `${phone || ""}|${displayName || ""}`;

              if (!participants.has(key)) {
                participants.set(key, {
                  name: name,
                  phone: phone || null,
                  element: element
                });
                newMembersThisRound++;
              } else {
                if (scrollIteration <= 3) {
                  console.log('  → Duplicate, skipping');
                }
              }
            } catch (err) {
              skippedThisRound++;
              console.error('Error processing element:', err);
            }
          }

          if (skippedThisRound > 0) {
            console.log(`⚠ Skipped ${skippedThisRound} elements this round`);
          }

          console.log(`New members extracted this round: ${newMembersThisRound}`);
          console.log(`Total unique members so far: ${participants.size}${expectedCount ? ` / ${expectedCount}` : ''}`);

          // Check if we've reached expected count
          if (expectedCount && participants.size >= expectedCount) {
            console.log('✓ Reached expected member count!');
            break;
          }

          // Check if we've loaded new members
          if (participants.size === lastMemberCount) {
            noChangeCount++;
            console.log(`⚠ No new members loaded (attempt ${noChangeCount}/${maxNoChange})`);
          } else {
            noChangeCount = 0; // Reset counter when we find new members
            console.log(`✓ Found ${participants.size - lastMemberCount} new members, resetting no-change counter`);
          }

          lastMemberCount = participants.size;

          // Check if we've reached the bottom
          const scrollTop = scrollContainer.scrollTop;
          const scrollHeight = scrollContainer.scrollHeight;
          const clientHeight = scrollContainer.clientHeight;
          const isAtBottom = (scrollTop + clientHeight) >= (scrollHeight - 50);

          console.log(`Scroll position: ${scrollTop} / ${scrollHeight} (client: ${clientHeight})`);

          if (isAtBottom) {
            console.log('📍 Reached bottom of scroll container');
            // Try scrolling up a bit and back down to trigger re-render
            scrollContainer.scrollTop = scrollTop - 500;
            await this.sleep(500);
            scrollContainer.scrollTop = scrollHeight;
            await this.sleep(1500); // Longer wait at bottom

            // Extract one more time at the bottom using improved logic
            const finalElements = document.querySelectorAll('._ak8l');
            for (const element of finalElements) {
              try {
                const primaryContainer = element.querySelector("div._ak8q") || element;
                const primarySpan =
                  primaryContainer.querySelector("span[title]") ||
                  primaryContainer.querySelector("span[dir='auto']");

                let phone = "";
                let displayName = "";

                if (primarySpan) {
                  const titleValue = primarySpan.getAttribute("title") || "";
                  const textValue = (primarySpan.textContent || "").trim();
                  const phoneCandidate = titleValue || textValue;

                  if (this.isProbablyPhone(phoneCandidate)) {
                    phone = phoneCandidate.trim();
                    if (textValue && textValue !== phone) {
                      displayName = textValue;
                    }
                  } else {
                    displayName = (titleValue || textValue).trim();
                  }
                }

                if (!phone) {
                  const candidates = Array.from(
                    element.querySelectorAll("span[dir='auto'], span[title]")
                  );
                  for (const span of candidates) {
                    if (span === primarySpan) continue;
                    const candTitle = span.getAttribute("title") || "";
                    const candText = (span.textContent || "").trim();
                    const candValue = candTitle || candText;
                    if (candValue && this.isProbablyPhone(candValue)) {
                      phone = candValue.trim();
                      break;
                    }
                  }
                }

                if (!phone && !displayName) continue;

                const name = displayName || phone;
                const key = `${phone || ""}|${displayName || ""}`;

                if (!participants.has(key)) {
                  participants.set(key, {
                    name: name,
                    phone: phone || null,
                    element: element
                  });
                }
              } catch (err) {
                console.error('Error in bottom extraction:', err);
              }
            }

            if (participants.size === lastMemberCount) {
              console.log('No new members found at bottom, ending extraction');
              break;
            } else {
              console.log(`Found ${participants.size - lastMemberCount} more members at bottom`);
            }
          } else {
            // IMPROVED SCROLL STRATEGY (from working extension)
            // Scroll by percentage of visible area, not fixed pixels!
            const clientHeight = scrollContainer.clientHeight;
            const scrollStep = clientHeight * 0.8; // 80% of visible area

            scrollContainer.scrollTop = scrollTop + scrollStep;
            console.log(`⬇ Scrolling down by ${Math.round(scrollStep)}px (80% of ${clientHeight}px visible area)...`);

            // Working extension uses only 250ms delay!
            await this.sleep(500); // Faster than before, but still safe
          }
        }

        console.log('\n✅ Scrolling complete!');
        console.log(`Total members extracted: ${participants.size}`);
        if (expectedCount) {
          const percentage = ((participants.size / expectedCount) * 100).toFixed(1);
          console.log(`Expected: ${expectedCount} (${percentage}% extracted)`);

          if (participants.size < expectedCount) {
            console.warn(`⚠ WARNING: Missing ${expectedCount - participants.size} members!`);
          }
        }
      } else {
        console.error('❌ Scrollable container not found!');
      }

      // Convert Map to Array
      const participantsArray = Array.from(participants.values());

      console.log('Extracted members count:', participantsArray.length);
      console.log('Sample members:', participantsArray.slice(0, 3));

      // Close the modal
      await this.closeModal();

      return { success: true, members: participantsArray };
    } catch (error) {
      console.error('Error extracting members:', error);
      // Try to close modal even on error
      try {
        await this.closeModal();
      } catch (e) {
        console.error('Error closing modal:', e);
      }
      return { success: false, error: error.message, members: [] };
    }
  }

  /**
   * Alternative extraction method: Scroll to specific percentages
   * This can be more reliable for large virtualized lists
   */
  async extractMembersAlternative() {
    try {
      console.log('🔄 Using ALTERNATIVE extraction method (percentage-based scrolling)');

      const scrollContainer = document.querySelector('div.xupqr0c');
      if (!scrollContainer) {
        return { success: false, error: 'Scroll container not found', members: [] };
      }

      const participants = new Map();
      const scrollHeight = scrollContainer.scrollHeight;

      // Scroll to specific percentages: 0%, 10%, 20%, ..., 100%
      const scrollPercentages = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];

      for (const percentage of scrollPercentages) {
        const targetScroll = (scrollHeight * percentage) / 100;
        scrollContainer.scrollTop = targetScroll;

        console.log(`📍 Scrolled to ${percentage}%`);
        await this.sleep(2000); // Long wait for rendering

        // Extract visible members
        const memberElements = document.querySelectorAll('._ak8l');
        let newCount = 0;

        for (const element of memberElements) {
          const spanElements = element.querySelectorAll('span[dir="auto"][title]');
          if (spanElements.length > 0) {
            const primaryText = spanElements[0].getAttribute('title') || spanElements[0].textContent.trim();
            let name = null;
            let phone = null;
            const isPhoneNumber = /^[\+\d\s\-\(\)]+$/.test(primaryText) || primaryText.startsWith('+');

            if (isPhoneNumber) {
              phone = primaryText;
              name = primaryText;
            } else {
              name = primaryText;
              const phoneContainer = element.querySelector('._ajzr');
              if (phoneContainer) {
                const phoneElement = phoneContainer.querySelector('span[dir="auto"]');
                if (phoneElement) {
                  phone = phoneElement.textContent.trim();
                }
              }
            }

            const key = phone || name;
            if (key && !participants.has(key)) {
              participants.set(key, { name, phone, element });
              newCount++;
            }
          }
        }

        console.log(`  New: ${newCount}, Total: ${participants.size}`);
      }

      return { success: true, members: Array.from(participants.values()) };
    } catch (error) {
      return { success: false, error: error.message, members: [] };
    }
  }

  /**
   * Close the members modal
   */
  async closeModal() {
    try {
      const closeButton = document.querySelector('button[aria-label="Close"]');
      if (closeButton) {
        await this.clickElement(closeButton);
        await this.sleep(1000);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove a specific member from the group
   */
  /**
   * Try to use WhatsApp's internal API to remove a member directly
   * This bypasses the need to click menu items (avoids isTrusted issue)
   */
  async removeParticipantDirectly(groupId, memberPhone) {
    try {
      console.log(`Trying internal API to remove ${memberPhone} from group...`);

      // Method 1: Check for WPP API (from WPPConnect/WA-JS)
      if (typeof window.WPP !== 'undefined' && window.WPP.group) {
        console.log('  Found WPP.group API');
        await window.WPP.group.removeParticipants(groupId, [memberPhone]);
        console.log(`✓ Successfully removed using WPP API`);
        return { success: true };
      }

      // Method 2: Check for Store API (WhatsApp's internal Store)
      if (typeof window.Store !== 'undefined' && window.Store.GroupUtils) {
        console.log('  Found Store.GroupUtils API');
        await window.Store.GroupUtils.removeParticipants(groupId, [memberPhone]);
        console.log(`✓ Successfully removed using Store API`);
        return { success: true };
      }

      // Method 3: Check for alternative Store structure
      if (typeof window.Store !== 'undefined' && window.Store.Participants) {
        console.log('  Found Store.Participants API');
        await window.Store.Participants.removeParticipants(groupId, [memberPhone]);
        console.log(`✓ Successfully removed using Participants API`);
        return { success: true };
      }

      console.log('❌ No internal APIs found');
      return { success: false, error: 'WhatsApp internal APIs not available' };
    } catch (error) {
      console.error('Error using internal API:', error);
      return { success: false, error: error.message };
    }
  }

  async removeMember(memberName, memberPhone) {
    try {
      console.log('Attempting to remove member:', memberName, memberPhone);

      // FIRST: Try using WhatsApp's internal API (bypasses isTrusted issue)
      // Get the current group ID first
      let groupId = null;
      try {
        // Try to get group ID from current chat
        if (window.WPP && window.WPP.whatsapp && window.WPP.whatsapp.ChatStore) {
          const activeChat = window.WPP.whatsapp.ChatStore.getActive();
          groupId = activeChat?.id;
        } else if (window.Store && window.Store.Chat) {
          const activeChat = window.Store.Chat.getActive();
          groupId = activeChat?.id;
        }

        if (groupId) {
          console.log(`Found group ID: ${groupId}`);
          const directResult = await this.removeParticipantDirectly(groupId, memberPhone);
          if (directResult.success) {
            console.log('✓✓✓ Member removed successfully using internal API!');
            return { success: true };
          }
        }
      } catch (e) {
        console.log('Internal API attempt failed, falling back to UI method:', e.message);
      }

      console.log('Proceeding with UI-based removal method...');

      // Check if the members modal is already open (from previous removal)
      const searchFieldCheck = document.querySelector('div[contenteditable="true"][aria-label="Search contacts"][data-tab="3"]');
      const isModalAlreadyOpen = searchFieldCheck !== null;

      if (isModalAlreadyOpen) {
        console.log('✓ Members modal is already open from previous removal, skipping open steps');
      } else {
        console.log('Members modal is closed, opening it...');

        // Step 1: Open group info
        await this.openGroupInfo();
        await this.sleep(this.waitTime);

        // Step 2: Open members modal
        const modalResult = await this.openMembersModal();
        if (!modalResult.success) {
          return { success: false, error: 'Failed to open members modal: ' + modalResult.error };
        }

        await this.sleep(this.waitTime);
      }

      // Step 3: Find and click the search field
      console.log('Looking for search field...');

      // Use exact selector from WhatsApp Web
      const searchField = document.querySelector('div[contenteditable="true"][aria-label="Search contacts"][data-tab="3"]');

      if (!searchField) {
        await this.closeModal();
        return { success: false, error: 'Search field not found in members modal' };
      }

      console.log('Found search field');

      const searchTerm = memberPhone || memberName;
      console.log('Attempting to trigger search for:', searchTerm);

      // Method: Use DataTransfer with paste event + React _valueTracker hack
      // This is the most reliable way to trigger WhatsApp's React onChange handlers
      console.log('Using DataTransfer paste event method...');

      try {
        // Step 1: Focus the field
        searchField.click();
        searchField.focus();
        await this.sleep(300);

        // Step 2: Clear existing content
        searchField.textContent = '';
        await this.sleep(200);

        // Step 3: Set the inner paragraph structure that WhatsApp expects
        let innerParagraph = searchField.querySelector('p');
        if (!innerParagraph) {
          innerParagraph = document.createElement('p');
          innerParagraph.className = 'selectable-text copyable-text x15bjb6t x1n2onr6';
          innerParagraph.setAttribute('dir', 'auto');
          searchField.appendChild(innerParagraph);
        }
        innerParagraph.textContent = searchTerm;

        // Step 4: Try to trigger React's onChange using _valueTracker hack
        // This works for React input elements
        if (searchField._valueTracker) {
          console.log('  Found _valueTracker, attempting to trigger React onChange...');
          const lastValue = searchField.textContent;
          searchField._valueTracker.setValue(''); // Set to empty first
          searchField.textContent = searchTerm;

          // Dispatch input event which React will pick up
          const inputEvent = new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: searchTerm
          });
          searchField.dispatchEvent(inputEvent);
        } else {
          console.log('  No _valueTracker found, using standard event dispatch...');

          // Try accessing React's internal props and calling onChange directly
          const reactPropsKey = Object.keys(searchField).find(key =>
            key.startsWith('__reactProps') || key.startsWith('__reactEventHandlers')
          );

          if (reactPropsKey && searchField[reactPropsKey]?.onChange) {
            console.log('  Found React onChange handler, calling it directly...');
            searchField[reactPropsKey].onChange({
              target: searchField,
              currentTarget: searchField
            });
          }

          // Dispatch comprehensive event chain
          searchField.dispatchEvent(new Event('focus', { bubbles: true }));
          await this.sleep(50);

          searchField.dispatchEvent(new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: searchTerm
          }));
          await this.sleep(50);

          searchField.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: searchTerm
          }));
          await this.sleep(50);

          searchField.dispatchEvent(new Event('change', { bubbles: true }));
          await this.sleep(50);

          // Keyboard events to simulate real typing
          searchField.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
          searchField.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
        }

        console.log('✓ Search field populated with:', searchField.textContent.trim());
        console.log('  Waiting for WhatsApp to process search...');
        await this.sleep(1500);

      } catch (error) {
        console.error('Error during search field manipulation:', error);
        return { success: false, error: 'Failed to populate search field: ' + error.message };
      }

      // Step 4: Wait for search results to appear (poll for up to 10 seconds)
      console.log('Waiting for search results (polling for up to 10 seconds)...');
      const searchResult = await this.waitForSearchResults(searchTerm, 10000);

      if (!searchResult.success) {
        console.log(`❌ Search failed: ${searchResult.error}`);
        await this.clearSearch();
        await this.closeModal();
        return { success: false, error: searchResult.error };
      }

      if (searchResult.memberCount === 0) {
        console.log('❌ No entries found - Member not present in group');
        await this.clearSearch();
        await this.closeModal();
        return { success: false, error: `Member not found: ${searchTerm} is not in the group` };
      }

      console.log(`✓ Search completed successfully. Found ${searchResult.memberCount} matching entry/entries`);

      // Use the first (and ideally only) entry
      const targetElement = searchResult.memberElements[0];

      // Verify it's the correct member
      const spanElements = targetElement.querySelectorAll('span[dir="auto"][title]');
      let foundName = 'Unknown';
      let foundPhone = null;

      if (spanElements.length > 0) {
        const primaryText = spanElements[0].getAttribute('title') || spanElements[0].textContent.trim();
        const isPhoneNumber = /^[\+\d\s\-\(\)]+$/.test(primaryText) || primaryText.startsWith('+');

        if (isPhoneNumber) {
          foundPhone = primaryText;
          foundName = primaryText;
        } else {
          foundName = primaryText;
          const phoneContainer = targetElement.querySelector('._ajzr');
          if (phoneContainer) {
            const phoneElement = phoneContainer.querySelector('span[dir="auto"]');
            if (phoneElement) {
              foundPhone = phoneElement.textContent.trim();
            }
          }
        }
      }

      console.log(`✓ Target member: ${foundName}${foundPhone ? ' | ' + foundPhone : ''}`);
      console.log(`  Ready to remove this member`);

      // Click on the member to open their context menu
      // According to user testing: We need to click directly on the ._ak8l div (the contact info div)
      // Not the outer role="button" wrapper
      const contactInfoDiv = targetElement.querySelector('._ak8l');

      if (!contactInfoDiv) {
        console.error('❌ Could not find ._ak8l div (contact info) inside contact entry');
        console.log('Trying fallback: div[role="button"]...');

        const clickableButton = targetElement.querySelector('div[role="button"]');
        if (!clickableButton) {
          await this.clearSearch();
          await this.closeModal();
          return { success: false, error: 'Could not find clickable contact element' };
        }

        // Use the button as fallback
        var elementToClick = clickableButton;
      } else {
        console.log('✓ Found ._ak8l div, will click it directly');
        var elementToClick = contactInfoDiv;
      }

      // Scroll the element into view first
      console.log('Scrolling contact into view...');
      elementToClick.scrollIntoView({ behavior: 'auto', block: 'center' });
      await this.sleep(300);

      // DEBUG: Log all possible clickable elements in the contact entry
      console.log('=== DEBUG: Analyzing contact entry structure ===');
      console.log('Element to click:', elementToClick.className);
      console.log('HTML preview:', elementToClick.outerHTML.substring(0, 200) + '...');

      // Look for menu button or three-dots icon
      const menuButtons = targetElement.querySelectorAll('button, [role="button"], [data-icon*="menu"], [data-icon*="down"], [aria-label*="Menu"]');
      console.log(`Found ${menuButtons.length} potential menu buttons in contact entry`);
      menuButtons.forEach((btn, i) => {
        console.log(`  Button ${i + 1}:`, btn.getAttribute('aria-label') || btn.getAttribute('data-icon') || btn.className);
      });

      // Get element position for realistic mouse events
      const rect = elementToClick.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      console.log(`Element position: x=${x}, y=${y}`);

      // Dispatch full mouse event sequence (mousedown -> mouseup -> click)
      console.log('Dispatching mouse events on ._ak8l div...');

      const mousedownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 0
      });
      elementToClick.dispatchEvent(mousedownEvent);
      await this.sleep(50);

      const mouseupEvent = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 0
      });
      elementToClick.dispatchEvent(mouseupEvent);
      await this.sleep(50);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 0
      });
      elementToClick.dispatchEvent(clickEvent);
      console.log('✓ Click event dispatched on ._ak8l div');
      await this.sleep(1000);  // Wait longer for menu to appear

      // Check if menu appeared
      let menuItems = document.querySelectorAll('li[role="button"][data-animate-dropdown-item="true"]');
      console.log(`After left-click: Found ${menuItems.length} menu items`);

      // If no menu, try also calling .click() directly (native method)
      if (menuItems.length === 0) {
        console.log('No menu appeared, trying native .click() method...');
        elementToClick.click();
        await this.sleep(1000);

        menuItems = document.querySelectorAll('li[role="button"][data-animate-dropdown-item="true"]');
        console.log(`After .click(): Found ${menuItems.length} menu items`);
      }

      // If still no menu, try right-click (context menu)
      if (menuItems.length === 0) {
        console.log('Still no menu, trying right-click (contextmenu event)...');

        // Dispatch contextmenu event (right-click) with coordinates
        const contextMenuEvent = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y,
          button: 2  // Right mouse button
        });
        elementToClick.dispatchEvent(contextMenuEvent);
        await this.sleep(1000);

        // Check again
        menuItems = document.querySelectorAll('li[role="button"][data-animate-dropdown-item="true"]');
        console.log(`After right-click: Found ${menuItems.length} menu items`);
      }

      // Look for "Remove" option in the menu
      let removeButton = null;

      // Re-query menu items to get the latest state
      menuItems = document.querySelectorAll('li[role="button"][data-animate-dropdown-item="true"]');
      console.log(`Found ${menuItems.length} menu items`);

      for (const item of menuItems) {
        // Look for the span containing "Remove" text or the clear-refreshed icon
        const hasRemoveIcon = item.querySelector('span[data-icon="clear-refreshed"]');
        const text = item.textContent.toLowerCase();

        if (hasRemoveIcon || (text.includes('remove') && !text.includes('admin'))) {
          removeButton = item;
          console.log('Found remove button:', item.textContent.trim());
          break;
        }
      }

      if (!removeButton) {
        console.error('❌ Remove button not found in menu');
        console.error(`   Menu had ${menuItems.length} items total`);
        if (menuItems.length > 0) {
          console.error('   Available menu items:');
          menuItems.forEach((item, i) => {
            console.error(`     ${i + 1}. ${item.textContent.trim()}`);
          });
        }
        await this.clearSearch();
        await this.closeModal();
        return { success: false, error: 'Remove button not found. Make sure you are an admin.' };
      }

      // Click remove button
      await this.clickElement(removeButton);
      console.log('Clicked remove button');

      // Wait for removal to complete (notification will appear, no OK button to click)
      await this.sleep(1500);

      // Step 5: Clear the search / Cancel search
      await this.clearSearch();

      // Step 6: Keep modal open for next member (popup.js will handle closing when done)
      // Don't close the modal here - let the calling function decide

      return { success: true };
    } catch (error) {
      console.error('Error removing member:', error);
      // Try to clear search and close modal on error
      try {
        await this.clearSearch();
        await this.closeModal();
      } catch (e) {
        console.error('Error in cleanup:', e);
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for search results to appear in the modal
   * Polls every 500ms for up to maxTimeout milliseconds
   * Waits for either:
   * - "No contacts found" message (member not found)
   * - Exactly 1 contact entry (member found)
   * If multiple entries or still loading, keeps waiting
   */
  async waitForSearchResults(searchTerm, maxTimeout = 10000) {
    const startTime = Date.now();
    const pollInterval = 500; // Check every 500ms
    let lastStatus = '';

    console.log(`🔍 Starting search polling for: "${searchTerm}"`);
    console.log(`   Max timeout: ${maxTimeout}ms (${maxTimeout / 1000} seconds)`);

    // First, find the members modal container to scope our search
    // The search field is inside the modal, so we can use it to find the modal
    const searchField = document.querySelector('div[contenteditable="true"][aria-label="Search contacts"][data-tab="3"]');
    if (!searchField) {
      console.error('❌ Search field not found - cannot determine modal scope');
      return {
        success: false,
        error: 'Search field not found',
        memberCount: 0,
        memberElements: []
      };
    }

    // Find the modal container by traversing up the DOM
    // The modal is typically a span with role="dialog" or a div with specific class
    let modalContainer = searchField.closest('span[role="dialog"]');
    if (!modalContainer) {
      // Fallback: try to find a parent container that looks like a modal
      modalContainer = searchField.closest('div[style*="transform"]');
    }
    if (!modalContainer) {
      // Last resort: use a high-level parent
      modalContainer = searchField.parentElement.parentElement.parentElement;
    }

    console.log(`   Scoping search to modal container: ${modalContainer.tagName}`);

    while (Date.now() - startTime < maxTimeout) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Case 1: Check for "No contacts found" message (only within modal)
      const noContactsDiv = Array.from(modalContainer.querySelectorAll('div')).find(div =>
        div.textContent.trim() === 'No contacts found'
      );

      if (noContactsDiv) {
        if (lastStatus !== 'not_found') {
          console.log(`   [${elapsed}s] "No contacts found" message detected`);
          lastStatus = 'not_found';
        }
        console.log(`✓ Search completed in ${elapsed}s: Member not found`);
        return {
          success: true,
          memberCount: 0,
          memberElements: []
        };
      }

      // Case 2: Check for contact entries (role="listitem") ONLY within modal
      const listItems = modalContainer.querySelectorAll('div[role="listitem"]');
      const contactEntries = Array.from(listItems).filter(item => {
        // Exclude "View past members" button - it's a listitem but not a contact
        const viewPastButton = item.querySelector('button');
        if (viewPastButton && viewPastButton.textContent.includes('View past members')) {
          return false;
        }

        // Check if this listitem contains a contact (has a span with title attribute)
        const contactSpan = item.querySelector('span[dir="auto"][title]');
        return contactSpan !== null;
      });

      const currentCount = contactEntries.length;
      const statusMsg = `${currentCount} contact entries`;

      if (lastStatus !== statusMsg) {
        console.log(`   [${elapsed}s] Found ${statusMsg} (in modal only)`);
        lastStatus = statusMsg;
      }

      // If exactly 1 contact entry found, member is present
      if (currentCount === 1) {
        console.log(`✓ Search completed in ${elapsed}s: 1 contact found (member present)`);
        return {
          success: true,
          memberCount: 1,
          memberElements: contactEntries
        };
      }

      // Case 3: Multiple entries or zero entries (but no "not found" message yet)
      // Continue waiting...
      await this.sleep(pollInterval);
    }

    // Timeout reached - search didn't complete properly
    const finalListItems = modalContainer.querySelectorAll('div[role="listitem"]');
    const finalContacts = Array.from(finalListItems).filter(item => {
      // Exclude "View past members" button
      const viewPastButton = item.querySelector('button');
      if (viewPastButton && viewPastButton.textContent.includes('View past members')) {
        return false;
      }
      return item.querySelector('span[dir="auto"][title]') !== null;
    });

    console.error(`❌ Search timeout after ${maxTimeout / 1000}s. Still showing ${finalContacts.length} contact entries in modal.`);
    console.error('   Expected either "No contacts found" message or exactly 1 contact entry.');

    return {
      success: false,
      error: `Search timeout: Still showing ${finalContacts.length} entries after ${maxTimeout / 1000}s. Expected "No contacts found" or 1 contact.`,
      memberCount: finalContacts.length,
      memberElements: []
    };
  }

  /**
   * Clear the search field in members modal
   */
  async clearSearch() {
    try {
      console.log('Clearing search...');

      // Use exact selector from WhatsApp Web for cancel search button
      const cancelButton = document.querySelector('button[aria-label="Cancel search"]');

      if (cancelButton) {
        await this.clickElement(cancelButton);
        console.log('Clicked cancel search button');
        await this.sleep(500);
        return { success: true };
      }

      // Alternative: Clear the search field manually if cancel button not found
      const searchField = document.querySelector('div[contenteditable="true"][aria-label="Search contacts"][data-tab="3"]');
      if (searchField) {
        // Clear the inner paragraph element
        const innerParagraph = searchField.querySelector('p');
        if (innerParagraph) {
          innerParagraph.innerHTML = '<br>'; // WhatsApp uses <br> for empty state
        } else {
          searchField.textContent = '';
        }

        const inputEvent = new Event('input', { bubbles: true });
        searchField.dispatchEvent(inputEvent);
        await this.sleep(500);
        console.log('Cleared search field manually');
        return { success: true };
      }

      console.warn('Could not find cancel search button or search field');
      return { success: false };
    } catch (error) {
      console.error('Error clearing search:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the group name from WhatsApp Web
   */
  getGroupName() {
    try {
      // Try multiple selectors to find the group name
      const headerSpans = document.querySelectorAll('header span[dir="auto"]');

      for (const span of headerSpans) {
        const text = span.textContent.trim();
        // Group name is usually the first substantial text in header
        // Exclude things like "typing..." or status messages
        if (text &&
            text.length > 0 &&
            !text.includes('typing') &&
            !text.includes('online') &&
            !text.toLowerCase().includes('click here')) {
          console.log('Found group name:', text);
          return text;
        }
      }

      // Fallback: look for title attribute
      const headerTitle = document.querySelector('header span[title]');
      if (headerTitle) {
        const title = headerTitle.getAttribute('title');
        if (title && title.length > 0) {
          console.log('Found group name from title:', title);
          return title;
        }
      }

      console.warn('Could not find group name');
      return 'Unknown Group';
    } catch (error) {
      console.error('Error getting group name:', error);
      return 'Unknown Group';
    }
  }

  /**
   * Check if user is on a group chat page
   */
  isOnGroupChat() {
    // Check multiple possible indicators that we're on WhatsApp Web with a chat open
    const indicators = [
      document.querySelector('header'),
      document.querySelector('header div[role="button"][data-tab]'),
      document.querySelector('button[aria-label="Search"]'),
      document.querySelector('button[aria-label="Menu"]'),
      document.querySelector('span[dir="auto"]')
    ];

    const found = indicators.some(el => el !== null);
    console.log('Group chat detection:', found, 'URL:', window.location.href);
    console.log('Indicators found:', {
      header: !!document.querySelector('header'),
      headerButton: !!document.querySelector('header div[role="button"][data-tab]'),
      searchButton: !!document.querySelector('button[aria-label="Search"]'),
      menuButton: !!document.querySelector('button[aria-label="Menu"]'),
      nameSpan: !!document.querySelector('span[dir="auto"]')
    });
    return found;
  }
}

// Initialize controller
const whatsappController = new WhatsAppController();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.action) {
        case 'checkPage':
          sendResponse({
            success: true,
            isGroupChat: whatsappController.isOnGroupChat()
          });
          break;

        case 'extractMembers':
          const membersResult = await whatsappController.extractMembers();
          sendResponse(membersResult);
          break;

        case 'extractMembersAlternative':
          const altResult = await whatsappController.extractMembersAlternative();
          sendResponse(altResult);
          break;

        case 'removeMember':
          const removeResult = await whatsappController.removeMember(
            request.memberName,
            request.memberPhone
          );
          sendResponse(removeResult);
          break;

        case 'closeModal':
          const closeResult = await whatsappController.closeModal();
          sendResponse(closeResult);
          break;

        case 'getGroupName':
          const groupName = whatsappController.getGroupName();
          sendResponse({ success: true, groupName: groupName });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();

  // Return true to indicate async response
  return true;
});

// Log that content script loaded
console.log('%c WhatsApp Member Manager: Content script loaded successfully! ', 'background: #25D366; color: white; font-size: 14px; padding: 4px;');

// Make controller globally accessible for debugging
window.whatsappController = whatsappController;

} // End of if-else block for preventing re-injection
