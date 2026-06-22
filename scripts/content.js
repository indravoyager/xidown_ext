// content.js - Smart Title Cleaner

let isEnabled = true;

// ============================================================================
// 1. CREATE BUTTON (UI COMPACT & FIXED SIZE)
// ============================================================================
const btn = document.createElement('div');
btn.id = 'xidown-btn';
btn.innerText = 'DL'; 

// Styling: Pink, Compact, Fixed Width, Monospace, Square Corners
btn.style.cssText = `
  position: absolute;
  z-index: 2147483647;
  background: #db2777; 
  color: white;
  font-family: 'Terminal', 'Fixedsys', 'Consolas', 'Courier New', monospace;
  font-size: 10px; 
  font-weight: bold;
  width: 28px;           
  text-align: center;    
  padding: 2px 0;        
  border-radius: 0;
  border: none;
  outline: none;
  cursor: pointer;
  display: none;
  white-space: nowrap;
  pointer-events: auto;
  transition: opacity 0.2s, background 0.2s; 
`;

document.body.appendChild(btn);

let targetVideo = null;

// ============================================================================
// 2. CHECK ON/OFF STATUS
// ============================================================================
function checkStatus() {
  chrome.storage.local.get(['xidownEnabled'], (result) => {
    isEnabled = result.xidownEnabled !== undefined ? result.xidownEnabled : true;
    if (!isEnabled) btn.style.display = 'none';
  });
}
checkStatus();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggle_status") {
    isEnabled = request.status;
    if (!isEnabled) btn.style.display = 'none';
  }
});

// ============================================================================
// 3. POSITION LOGIC
// ============================================================================
function updateButtonPosition() {
  if (!isEnabled) {
    btn.style.display = 'none';
    return;
  }

  const videos = Array.from(document.querySelectorAll('video'));
  const validVideos = videos.filter(v => {
    const r = v.getBoundingClientRect();
    return (v.videoWidth > 100 && v.videoHeight > 100) && 
           (r.width > 50 && r.height > 50) && 
           (r.top < window.innerHeight && r.bottom > 0);
  });

  if (validVideos.length === 0) {
    btn.style.display = 'none';
    targetVideo = null;
    return;
  }

  validVideos.sort((a, b) => {
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();
    const centerScreenY = window.innerHeight / 2;
    const centerVideoA = rectA.top + (rectA.height / 2);
    const centerVideoB = rectB.top + (rectB.height / 2);
    return Math.abs(centerScreenY - centerVideoA) - Math.abs(centerScreenY - centerVideoB);
  });

  targetVideo = validVideos[0];
  const rect = targetVideo.getBoundingClientRect();
  
  btn.style.display = 'block';
  const topPos = rect.top + window.scrollY; 
  const rightPos = rect.right + window.scrollX;

  btn.style.top = `${topPos + 6}px`; 
  btn.style.left = `${rightPos - btn.offsetWidth - 6}px`; 
}

function loopCheck() {
  updateButtonPosition();
  requestAnimationFrame(loopCheck);
}
loopCheck();

// ============================================================================
// 4. URL DETECTIVE LOGIC
// ============================================================================
function getVideoUrl(videoEl) {
  if (!videoEl) return window.location.href;

  if (window.location.hostname.includes('facebook.com')) {
    const article = videoEl.closest('[role="article"]');
    if (article) {
      const allLinks = Array.from(article.querySelectorAll('a'));
      const targetLink = allLinks.find(a => {
        const h = a.href;
        const isVideoPattern = h.includes('/videos/') || h.includes('/watch/') || h.includes('/reel/') || h.includes('/posts/');
        const isNotNoise = !h.includes('/people/') && !h.includes('profile.php') && !h.includes('/hashtag/');
        return isVideoPattern && isNotNoise;
      });
      if (targetLink) return targetLink.href;
    }
    // Fallback logic...
    let current = videoEl;
    for (let i = 0; i < 20; i++) { 
      if (!current) break;
      if (current.tagName === 'A') {
         const h = current.href;
         if ((h.includes('/videos/') || h.includes('/reel/') || h.includes('/watch/')) && !h.includes('user')) {
            return h;
         }
      }
      const siblingLinks = current.querySelectorAll ? current.querySelectorAll('a[href*="/videos/"], a[href*="/watch/"]') : [];
      if (siblingLinks.length > 0) return siblingLinks[0].href;
      current = current.parentElement;
    }
  }

  let rawUrl = window.location.href;
  try {
    const urlObj = new URL(rawUrl);
    if (urlObj.hostname.includes('youtube')) {
       urlObj.searchParams.delete('list');
       urlObj.searchParams.delete('index');
       urlObj.searchParams.delete('t');
    }
    return urlObj.toString();
  } catch (e) {
    return rawUrl;
  }
}

// === [UPDATE: SMART CLEANER] ===
function getCleanTitle() {
  let title = document.title;
  
  // 1. Remove Number Notifications at the front: (1), (2), (99+)
  // Regex: ^ = start of line, \( = open parenthesis, \d+ = any digits, \) = close parenthesis
  title = title.replace(/^\(\d+\)\s+/, ''); 
  
  // 2. Remove Website Suffix (UPDATE: Includes Bilibili!)
  title = title.replace(' - YouTube', '')
               .replace(' - PikPak', '')
               .replace(' | Facebook', '')
               .replace('_哔哩哔哩_bilibili', ''); // <--- MAGIC FIX!

  return title.trim();
}

// ============================================================================
// 5. BUTTON CLICK ACTION
// ============================================================================
btn.onclick = async (e) => {
  e.stopPropagation();
  
  const originalText = "DL"; 
  const targetUrl = getVideoUrl(targetVideo); 
  const title = getCleanTitle();

  btn.innerText = "WT"; 
  btn.style.background = "#f59e0b"; 

  try {
    const response = await fetch('http://localhost:3000/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url: targetUrl, 
        filename: title 
      })
    });
    
    const resJson = await response.json();
    
    if (resJson.status === 'success') {
      btn.innerText = "OK";
      btn.style.background = "#10b981"; 
    } else {
      throw new Error("Rejected");
    }
  } catch (err) {
    btn.innerText = "ER";
    btn.style.background = "#ef4444"; 
  }

  setTimeout(() => {
    btn.innerText = originalText;
    btn.style.background = "#db2777"; 
  }, 2000);
};

// ============================================================================
// 6. HOVER EFFECT
// ============================================================================
btn.onmouseenter = () => { 
    btn.style.background = '#be185d'; 
};

btn.onmouseleave = () => { 
    btn.style.background = '#db2777'; 
};