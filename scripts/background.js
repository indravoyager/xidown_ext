// background.js - V3.2 (Clean & Clear)

let capturedData = {}; 

// HEADER SNIFFER
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const url = details.url;
    
    // Separate URL from Parameters
    const urlPath = url.split('?')[0].toLowerCase(); 

    // DETECT FILE TYPE
    const isM3u8 = urlPath.includes('.m3u8');
    const isMp4 = urlPath.endsWith('.mp4');

    // JUNK FILTER
    const isJunk = url.includes('bedata') || 
                   url.includes('googleads') || 
                   url.includes('doubleclick') || 
                   url.includes('analytics') || 
                   url.includes('/tr/') ||  
                   url.includes('pixel');

    // ENTRY CONDITIONS
    if ((isM3u8 || isMp4) && details.method === "GET" && !isJunk) {
      
      const tabId = details.tabId;
      if (tabId === -1) return; 

      // 1. Extract Headers
      const headers = {};
      details.requestHeaders.forEach(h => {
        if (['Cookie', 'User-Agent', 'Referer', 'Origin', 'Authorization', 'Accept-Language'].includes(h.name)) {
          headers[h.name] = h.value;
        }
      });

      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) return;

        if (!capturedData[tabId]) capturedData[tabId] = [];

        const fileType = isMp4 ? "MP4" : "M3U8";

        // === RANDOM CODE ===
        const randCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        const uniqueUrl = `${url}#id=${randCode}`;
        const uniqueTitle = `${tab.title || "Unknown"} [${randCode}]`;

        // Add to List
        capturedData[tabId].push({
          url: uniqueUrl,     
          title: uniqueTitle,  
          headers: headers,
          type: fileType, 
          timestamp: new Date().toLocaleTimeString()
        });

        // Limit 50 item
        if (capturedData[tabId].length > 50) {
            capturedData[tabId].shift(); 
        }

        // Badge Notification
        chrome.action.setBadgeText({text: "!", tabId: tabId});
        const badgeColor = isMp4 ? "#3b82f6" : "#db2777"; 
        chrome.action.setBadgeBackgroundColor({color: badgeColor, tabId: tabId});
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders", "extraHeaders"] 
);

chrome.tabs.onRemoved.addListener((tabId) => {
  if (capturedData[tabId]) delete capturedData[tabId];
});

// Message Handler (Get & Clear List)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "get_m3u8_list") {
    const list = capturedData[request.tabId] || [];
    sendResponse({ list: list });
  }
  else if (request.action === "clear_list") {
    if (request.tabId) {
      capturedData[request.tabId] = [];
      chrome.action.setBadgeText({text: "", tabId: request.tabId});
    }
  }
});