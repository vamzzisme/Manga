/**
 * Manga Book Reader - Core Frontend Logic
 */

// --- Application State ---
const state = {
  currentMangaUrl: '',
  mangaTitle: '',
  chapters: [],
  currentChapterUrl: '',
  currentChapterTitle: '',
  pages: [],
  currentPageIndex: 0, // In double-page, this is the index of the base page (right side in RTL)
  prevChapterUrl: null,
  nextChapterUrl: null,
  
  // Settings (default values)
  settings: {
    layout: 'double', // 'double', 'single', 'scroll'
    direction: 'rtl', // 'rtl', 'ltr'
    fit: 'contain',    // 'contain', 'height', 'width'
    theme: 'dark'     // 'dark', 'sepia', 'light'
  },
  
  // Landscape image detector cache
  landscapePages: {} // Map of pageUrl -> boolean
};

// --- DOM Elements ---
const DOM = {
  // Screens
  dashboardScreen: document.getElementById('dashboard-screen'),
  chaptersScreen: document.getElementById('chapters-screen'),
  readerScreen: document.getElementById('reader-screen'),
  
  // Dashboard
  mangaUrlInput: document.getElementById('manga-url-input'),
  loadMangaBtn: document.getElementById('load-manga-btn'),
  themeToggleBtn: document.getElementById('theme-toggle-btn'),
  historySection: document.getElementById('history-section'),
  historyGrid: document.getElementById('history-grid'),
  clearHistoryBtn: document.getElementById('clear-history-btn'),
  presetCards: document.querySelectorAll('.preset-card'),
  
  // Chapter list
  backToHomeBtn: document.getElementById('back-to-home-btn'),
  mangaTitleLabel: document.getElementById('manga-title'),
  mangaSourceLabel: document.getElementById('manga-source'),
  chaptersLoader: document.getElementById('chapters-loader'),
  chaptersList: document.getElementById('chapters-list'),
  chapterSearch: document.getElementById('chapter-search'),
  
  // Reader Navbar
  closeReaderBtn: document.getElementById('close-reader-btn'),
  readerMangaTitle: document.getElementById('reader-manga-title'),
  readerChapterTitle: document.getElementById('reader-chapter-title'),
  readerChaptersDropdownBtn: document.getElementById('reader-chapters-dropdown-btn'),
  readerChaptersDropdown: document.getElementById('reader-chapters-dropdown'),
  readerSettingsBtn: document.getElementById('reader-settings-btn'),
  readerFullscreenBtn: document.getElementById('reader-fullscreen-btn'),
  
  // Reader Stage
  readerStage: document.getElementById('reader-stage'),
  readerPagesLoader: document.getElementById('reader-pages-loader'),
  bookContainer: document.getElementById('book-container'),
  bookViewport: document.getElementById('book-viewport'),
  singleViewport: document.getElementById('single-viewport'),
  scrollViewport: document.getElementById('scroll-viewport'),
  
  // Navigation active zones
  navAreaLeft: document.getElementById('nav-area-left'),
  navAreaRight: document.getElementById('nav-area-right'),
  
  // Page slots & images
  pageLeft: document.getElementById('page-left'),
  pageRight: document.getElementById('page-right'),
  pageCenter: document.getElementById('page-center'),
  imgLeft: document.getElementById('img-left'),
  imgRight: document.getElementById('img-right'),
  imgCenter: document.getElementById('img-center'),
  
  // Reader Controls
  prevChapterBtn: document.getElementById('prev-chapter-btn'),
  nextChapterBtn: document.getElementById('next-chapter-btn'),
  readerPageIndicator: document.getElementById('reader-page-indicator'),
  readerScrubber: document.getElementById('reader-scrubber'),
  directionIndicatorBtn: document.getElementById('direction-indicator-btn'),
  
  // Settings modal
  settingsModal: document.getElementById('settings-modal'),
  closeSettingsBtn: document.getElementById('close-settings-btn'),
  settingsOptionBtns: document.querySelectorAll('.settings-option-btn'),
  settingsThemeBtns: document.querySelectorAll('.settings-theme-btn')
};

// --- Initialization ---
window.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  renderHistory();
  setupEventListeners();
  checkUrlParams();
});

// --- Settings Controller ---
function loadSettings() {
  const savedSettings = localStorage.getItem('manga_reader_settings');
  if (savedSettings) {
    state.settings = { ...state.settings, ...JSON.parse(savedSettings) };
  }
  
  // Apply layout settings
  updateSettingsUI();
  applyTheme(state.settings.theme);
  applyFitMode(state.settings.fit);
}

function saveSettings() {
  localStorage.setItem('manga_reader_settings', JSON.stringify(state.settings));
}

function updateSettingsUI() {
  // Update button active states in settings modal
  DOM.settingsOptionBtns.forEach(btn => {
    const setting = btn.getAttribute('data-setting');
    const value = btn.getAttribute('data-value');
    if (state.settings[setting] === value) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  DOM.settingsThemeBtns.forEach(btn => {
    const value = btn.getAttribute('data-value');
    if (state.settings.theme === value) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update direction text on reader footer
  if (DOM.directionIndicatorBtn) {
    DOM.directionIndicatorBtn.innerText = state.settings.direction === 'rtl' ? 'R → L' : 'L → R';
    DOM.directionIndicatorBtn.title = state.settings.direction === 'rtl' 
      ? 'Reading Direction: Right to Left (Manga)' 
      : 'Reading Direction: Left to Right (Western)';
  }

  // Adjust cues
  const leftCue = DOM.navAreaLeft.querySelector('.nav-cue-text');
  const rightCue = DOM.navAreaRight.querySelector('.nav-cue-text');
  
  if (state.settings.direction === 'rtl') {
    leftCue.innerText = 'Next Page';
    rightCue.innerText = 'Prev Page';
  } else {
    leftCue.innerText = 'Prev Page';
    rightCue.innerText = 'Next Page';
  }
}

function applyTheme(theme) {
  document.body.classList.remove('theme-dark', 'theme-sepia', 'theme-light');
  if (theme === 'sepia') {
    document.body.classList.add('theme-sepia');
  } else if (theme === 'light') {
    document.body.classList.add('theme-light');
  } else {
    document.body.classList.add('theme-dark');
  }
}

function applyFitMode(fit) {
  DOM.bookViewport.className = `book-viewport double-page fit-${fit}`;
  DOM.singleViewport.className = `book-viewport single-page fit-${fit}`;
}

// --- History Tracker ---
function addToHistory(mangaUrl, mangaTitle, chapterUrl, chapterTitle, pageIndex, totalPages) {
  let history = JSON.parse(localStorage.getItem('manga_reader_history') || '[]');
  
  // Remove existing entry for same manga to bubble it up
  history = history.filter(item => item.mangaUrl !== mangaUrl);
  
  history.unshift({
    mangaUrl,
    mangaTitle,
    chapterUrl,
    chapterTitle,
    pageIndex,
    totalPages,
    timestamp: Date.now()
  });
  
  // Cap history at 12 items
  if (history.length > 12) history.pop();
  
  localStorage.setItem('manga_reader_history', JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem('manga_reader_history') || '[]');
  if (history.length === 0) {
    DOM.historySection.classList.add('hidden');
    return;
  }
  
  DOM.historySection.classList.remove('hidden');
  DOM.historyGrid.innerHTML = '';
  
  history.forEach(item => {
    const card = document.createElement('div');
    card.className = 'history-card glass-card';
    
    const percentage = Math.round((item.pageIndex / Math.max(1, item.totalPages - 1)) * 100);
    const dateStr = new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    
    card.innerHTML = `
      <div class="history-cover">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
        </svg>
      </div>
      <div class="flex-grow min-w-0">
        <h4 class="font-semibold text-white truncate text-sm md:text-base">${item.mangaTitle}</h4>
        <p class="text-xs text-accent truncate mt-0.5">${item.chapterTitle}</p>
        <p class="text-[10px] text-gray-500 mt-1">Last read: ${dateStr} • Page ${item.pageIndex + 1}/${item.totalPages}</p>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${percentage}%"></div>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <button class="glass-btn text-xs px-3 py-1.5 rounded-lg resume-btn" data-manga="${encodeURIComponent(item.mangaUrl)}" data-chapter="${encodeURIComponent(item.chapterUrl)}" data-page="${item.pageIndex}">Resume</button>
      </div>
    `;
    
    // Add event listener to Resume button
    card.querySelector('.resume-btn').addEventListener('click', (e) => {
      e.preventDefault();
      const mUrl = decodeURIComponent(e.target.getAttribute('data-manga'));
      const cUrl = decodeURIComponent(e.target.getAttribute('data-chapter'));
      const pIdx = parseInt(e.target.getAttribute('data-page'), 10);
      
      loadMangaChapters(mUrl, () => {
        loadChapter(cUrl, pIdx);
      });
    });

    DOM.historyGrid.appendChild(card);
  });
}

// --- Navigation & Routing Helpers ---
function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const mangaUrl = params.get('url');
  if (mangaUrl) {
    DOM.mangaUrlInput.value = mangaUrl;
    loadMangaChapters(mangaUrl);
  }
}

function showScreen(screenId) {
  DOM.dashboardScreen.classList.add('hidden');
  DOM.chaptersScreen.classList.add('hidden');
  DOM.readerScreen.classList.add('hidden');
  
  if (screenId === 'dashboard') {
    DOM.dashboardScreen.classList.remove('hidden');
    document.title = "Manga Book Reader - Premium Interactive Reading";
    // Clear URL search params without page reload
    window.history.pushState({}, '', window.location.pathname);
  } else if (screenId === 'chapters') {
    DOM.chaptersScreen.classList.remove('hidden');
    document.title = `${state.mangaTitle} - Chapters | Manga Book`;
  } else if (screenId === 'reader') {
    DOM.readerScreen.classList.remove('hidden');
    document.title = `${state.mangaTitle} - ${state.currentChapterTitle} | Manga Book`;
  }
}

// --- API Calls ---

// Load all chapters for a manga series
async function loadMangaChapters(url, callback) {
  if (!url) return;
  state.currentMangaUrl = url;
  
  // Set shared url param
  window.history.pushState({}, '', `?url=${encodeURIComponent(url)}`);

  showScreen('chapters');
  DOM.mangaTitleLabel.innerText = "Loading Manga...";
  DOM.chaptersLoader.classList.remove('hidden');
  DOM.chaptersList.classList.add('hidden');
  
  try {
    const response = await fetch(`/api/chapters?url=${encodeURIComponent(url)}`);
    if (!response.ok) throw new Error('Network response not ok');
    const data = await response.json();
    
    state.mangaTitle = data.mangaTitle;
    state.chapters = data.chapters;
    
    DOM.mangaTitleLabel.innerText = state.mangaTitle;
    DOM.mangaSourceLabel.innerText = url.includes('tcbonepiece') || url.includes('onepiecechapters') ? 'TCB Scans Source' : 'Generic Source';
    
    renderChaptersList();
    
    DOM.chaptersLoader.classList.add('hidden');
    DOM.chaptersList.classList.remove('hidden');
    
    if (callback) callback();
  } catch (error) {
    console.error('Error fetching chapters:', error);
    DOM.mangaTitleLabel.innerText = "Failed to Load Manga";
    DOM.chaptersLoader.innerHTML = `<div class="text-red-500 font-semibold">Error: ${error.message}</div>`;
  }
}

function renderChaptersList() {
  DOM.chaptersList.innerHTML = '';
  
  if (state.chapters.length === 0) {
    DOM.chaptersList.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500 font-semibold">No chapters found on this page. Make sure the URL points to a valid series index.</div>';
    return;
  }

  state.chapters.forEach((chapter, index) => {
    const card = document.createElement('a');
    card.href = '#';
    card.className = 'chapter-card';
    card.innerHTML = `
      <div class="font-bold text-white text-base md:text-lg mb-1">${chapter.title}</div>
      <div class="text-xs text-gray-500 truncate">${chapter.description || 'Read chapter online'}</div>
    `;
    
    card.addEventListener('click', (e) => {
      e.preventDefault();
      state.currentChapterIndex = index;
      loadChapter(chapter.url);
    });
    
    DOM.chaptersList.appendChild(card);
  });
  
  // Also populate Reader Navbar Chapters Dropdown
  renderReaderChaptersDropdown();
}

function renderReaderChaptersDropdown() {
  DOM.readerChaptersDropdown.innerHTML = '';
  state.chapters.forEach((chapter, index) => {
    const link = document.createElement('button');
    link.className = `w-full text-left px-4 py-2 text-xs md:text-sm transition-colors text-gray-300 hover:bg-white/5 hover:text-white ${state.currentChapterUrl === chapter.url ? 'text-accent font-bold border-l-2 border-accent' : ''}`;
    link.innerText = chapter.title;
    
    link.addEventListener('click', () => {
      DOM.readerChaptersDropdown.classList.add('hidden');
      state.currentChapterIndex = index;
      loadChapter(chapter.url);
    });
    
    DOM.readerChaptersDropdown.appendChild(link);
  });
}

// Load pages for a specific chapter
async function loadChapter(url, startPageIdx = 0) {
  state.currentChapterUrl = url;
  state.currentPageIndex = startPageIdx;
  
  // Find current index in chapters list if not set
  if (state.chapters.length > 0) {
    const idx = state.chapters.findIndex(c => c.url === url);
    if (idx !== -1) state.currentChapterIndex = idx;
  }

  showScreen('reader');
  
  // Loader UI state
  DOM.readerPagesLoader.classList.remove('hidden');
  DOM.bookViewport.classList.add('opacity-10');
  DOM.singleViewport.classList.add('opacity-10');
  DOM.scrollViewport.classList.add('opacity-10');
  
  DOM.prevChapterBtn.disabled = true;
  DOM.nextChapterBtn.disabled = true;

  try {
    const response = await fetch(`/api/pages?url=${encodeURIComponent(url)}`);
    if (!response.ok) throw new Error('Failed to load page content');
    const data = await response.json();
    
    state.currentChapterTitle = data.chapterTitle;
    // Proxy the image URLs to bypass referer blocks
    state.pages = data.pages.map(pUrl => `/api/proxy-image?url=${encodeURIComponent(pUrl)}`);
    state.prevChapterUrl = data.prevUrl;
    state.nextChapterUrl = data.nextUrl;
    
    DOM.readerMangaTitle.innerText = state.mangaTitle;
    DOM.readerChapterTitle.innerText = state.currentChapterTitle;
    
    // Set scrubber min/max
    DOM.readerScrubber.min = 0;
    DOM.readerScrubber.max = state.pages.length - 1;
    
    // Auto detect landscape pages
    state.landscapePages = {};
    preloadNextPages();
    
    // Show correct layout
    switchViewportLayout();
    renderBookPages();
    
    DOM.readerPagesLoader.classList.add('hidden');
    DOM.bookViewport.classList.remove('opacity-10');
    DOM.singleViewport.classList.remove('opacity-10');
    DOM.scrollViewport.classList.remove('opacity-10');
    
    // Enable/disable chapter nav buttons
    updateChapterNavigationButtons();
    
    // Track reading history
    addToHistory(
      state.currentMangaUrl, 
      state.mangaTitle, 
      state.currentChapterUrl, 
      state.currentChapterTitle, 
      state.currentPageIndex, 
      state.pages.length
    );

    // Refresh dropdown highlighted item
    renderReaderChaptersDropdown();
  } catch (error) {
    console.error('Error loading chapter:', error);
    DOM.readerPagesLoader.innerHTML = `
      <div class="text-red-500 font-semibold mb-2">Error: ${error.message}</div>
      <button class="glass-btn text-xs px-4 py-2 rounded-lg" onclick="showScreen('chapters')">Back to Chapters</button>
    `;
  }
}

// Check if next/prev chapters are available
function updateChapterNavigationButtons() {
  // If scraper didn't return prev/next URLs, check in our chapters list
  if (!state.prevChapterUrl && state.chapters.length > 0 && state.currentChapterIndex < state.chapters.length - 1) {
    // In TCB, chapters are listed newest to oldest. So index + 1 is actually the PREVIOUS chapter released
    state.prevChapterUrl = state.chapters[state.currentChapterIndex + 1].url;
  }
  if (!state.nextChapterUrl && state.chapters.length > 0 && state.currentChapterIndex > 0) {
    // index - 1 is the NEXT chapter released
    state.nextChapterUrl = state.chapters[state.currentChapterIndex - 1].url;
  }
  
  DOM.prevChapterBtn.disabled = !state.prevChapterUrl;
  DOM.nextChapterBtn.disabled = !state.nextChapterUrl;
}

// --- Reader Viewport Layout Switcher ---
function switchViewportLayout() {
  const mode = state.settings.layout;
  
  DOM.bookViewport.classList.add('hidden');
  DOM.singleViewport.classList.add('hidden');
  DOM.scrollViewport.classList.add('hidden');
  
  if (mode === 'scroll') {
    DOM.scrollViewport.classList.remove('hidden');
    DOM.navAreaLeft.classList.add('hidden');
    DOM.navAreaRight.classList.add('hidden');
  } else if (mode === 'single') {
    DOM.singleViewport.classList.remove('hidden');
    DOM.navAreaLeft.classList.remove('hidden');
    DOM.navAreaRight.classList.remove('hidden');
  } else {
    // Double page
    DOM.bookViewport.classList.remove('hidden');
    DOM.navAreaLeft.classList.remove('hidden');
    DOM.navAreaRight.classList.remove('hidden');
  }
}

// Pre-detect landscape pages and preload images
function preloadNextPages() {
  // Preload surrounding pages for speed
  const range = 5;
  const start = Math.max(0, state.currentPageIndex - 2);
  const end = Math.min(state.pages.length, state.currentPageIndex + range);
  
  for (let i = start; i < end; i++) {
    const url = state.pages[i];
    if (!url) continue;
    
    const img = new Image();
    img.src = url;
    img.onload = () => {
      // Check if image is landscape (aspect ratio > 1.25)
      const ratio = img.naturalWidth / img.naturalHeight;
      state.landscapePages[url] = ratio > 1.25;
      
      // If we preloaded the active page, re-render to account for double-spread layout
      if (i === state.currentPageIndex || i === state.currentPageIndex + 1) {
        renderBookPages();
      }
    };
  }
}

// --- Render Book Pages ---
function renderBookPages() {
  const total = state.pages.length;
  if (total === 0) return;
  
  // Boundaries check
  if (state.currentPageIndex < 0) state.currentPageIndex = 0;
  if (state.currentPageIndex >= total) state.currentPageIndex = total - 1;
  
  const mode = state.settings.layout;
  const rtl = state.settings.direction === 'rtl';
  
  // 1. Long Strip Vertical Scroll Render
  if (mode === 'scroll') {
    renderScrollView();
    return;
  }
  
  // 2. Single Page Render
  if (mode === 'single') {
    renderSingleView();
    return;
  }
  
  // 3. Double Page Book View Render
  renderDoubleView(rtl);
}

function renderScrollView() {
  DOM.scrollViewport.innerHTML = '';
  
  state.pages.forEach((src, idx) => {
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'w-full py-2 flex justify-center';
    
    const img = document.createElement('img');
    img.className = 'max-w-full h-auto rounded shadow-lg';
    img.alt = `Page ${idx + 1}`;
    
    // Add opacity load effect
    img.style.opacity = '0';
    img.style.transition = 'opacity 0.3s ease';
    img.src = src;
    img.onload = () => img.style.opacity = '1';
    
    imgWrapper.appendChild(img);
    DOM.scrollViewport.appendChild(imgWrapper);
  });
  
  // Position to current page if we just entered scroll mode
  const target = DOM.scrollViewport.children[state.currentPageIndex];
  if (target) {
    target.scrollIntoView();
  }

  // Update Page Indicator
  DOM.readerPageIndicator.innerText = `Scroll Mode • Page ${state.currentPageIndex + 1}/${state.pages.length}`;
  DOM.readerScrubber.value = state.currentPageIndex;
  
  // Track scroll position to update scrubber
  DOM.scrollViewport.onscroll = () => {
    const scrollTop = DOM.scrollViewport.scrollTop;
    const scrollHeight = DOM.scrollViewport.scrollHeight - DOM.scrollViewport.clientHeight;
    if (scrollHeight <= 0) return;
    
    const idx = Math.min(
      state.pages.length - 1,
      Math.round((scrollTop / scrollHeight) * (state.pages.length - 1))
    );
    
    if (idx !== state.currentPageIndex) {
      state.currentPageIndex = idx;
      DOM.readerPageIndicator.innerText = `Scroll Mode • Page ${idx + 1}/${state.pages.length}`;
      DOM.readerScrubber.value = idx;
    }
  };
}

function renderSingleView() {
  const idx = state.currentPageIndex;
  const src = state.pages[idx];
  
  // Hide image initially, load and animate in
  DOM.imgCenter.classList.remove('loaded');
  DOM.imgCenter.src = src;
  
  DOM.imgCenter.onload = () => {
    DOM.imgCenter.classList.add('loaded');
  };
  
  DOM.pageCenter.querySelector('.page-number-badge').innerText = `Page ${idx + 1}`;
  
  // Update controls
  DOM.readerPageIndicator.innerText = `Page ${idx + 1} of ${state.pages.length}`;
  DOM.readerScrubber.value = idx;
}

function renderDoubleView(rtl) {
  const i = state.currentPageIndex;
  const total = state.pages.length;
  
  const currentUrl = state.pages[i];
  const nextUrl = i + 1 < total ? state.pages[i + 1] : null;
  
  // Check if current page is a landscape (double spread)
  const isCurrentLandscape = state.landscapePages[currentUrl] === true;
  
  if (isCurrentLandscape) {
    // Force a temporary single page spread view inside the double viewport layout
    // We achieve this by stretching the right (or center) slot across the seam
    DOM.pageLeft.style.display = 'none';
    DOM.bookViewport.querySelector('.book-seam').style.display = 'none';
    DOM.pageRight.classList.remove('right');
    DOM.pageRight.classList.add('center');
    
    DOM.imgRight.classList.remove('loaded');
    DOM.imgRight.src = currentUrl;
    DOM.imgRight.onload = () => DOM.imgRight.classList.add('loaded');
    
    DOM.pageRight.querySelector('.page-number-badge').innerText = `Page ${i + 1} [Spread]`;
    DOM.readerPageIndicator.innerText = `Page ${i + 1} of ${total}`;
    DOM.readerScrubber.value = i;
    return;
  }
  
  // Revert layout styles back to double-page standard split
  DOM.pageLeft.style.display = 'flex';
  DOM.bookViewport.querySelector('.book-seam').style.display = 'block';
  DOM.pageRight.classList.remove('center');
  DOM.pageRight.classList.add('right');
  
  // Check if next page is landscape. If it is, we should not display it alongside current page
  const isNextLandscape = nextUrl && state.landscapePages[nextUrl] === true;
  
  let pLeftUrl = null;
  let pRightUrl = null;
  let pLeftNum = null;
  let pRightNum = null;
  
  if (rtl) {
    // Manga style: right page is current page (i), left page is next page (i + 1)
    pRightUrl = currentUrl;
    pRightNum = i + 1;
    
    if (nextUrl && !isNextLandscape) {
      pLeftUrl = nextUrl;
      pLeftNum = i + 2;
    }
  } else {
    // Western style: left page is current page (i), right page is next page (i + 1)
    pLeftUrl = currentUrl;
    pLeftNum = i + 1;
    
    if (nextUrl && !isNextLandscape) {
      pRightUrl = nextUrl;
      pRightNum = i + 2;
    }
  }
  
  // Load left page image
  if (pLeftUrl) {
    DOM.imgLeft.style.display = 'block';
    DOM.imgLeft.classList.remove('loaded');
    DOM.imgLeft.src = pLeftUrl;
    DOM.imgLeft.onload = () => DOM.imgLeft.classList.add('loaded');
    DOM.pageLeft.querySelector('.page-number-badge').innerText = `Page ${pLeftNum}`;
    DOM.pageLeft.querySelector('.page-placeholder').style.display = 'none';
  } else {
    DOM.imgLeft.style.display = 'none';
    DOM.pageLeft.querySelector('.page-number-badge').innerText = '';
    DOM.pageLeft.querySelector('.page-placeholder').style.display = 'block';
  }
  
  // Load right page image
  if (pRightUrl) {
    DOM.imgRight.style.display = 'block';
    DOM.imgRight.classList.remove('loaded');
    DOM.imgRight.src = pRightUrl;
    DOM.imgRight.onload = () => DOM.imgRight.classList.add('loaded');
    DOM.pageRight.querySelector('.page-number-badge').innerText = `Page ${pRightNum}`;
    DOM.pageRight.querySelector('.page-placeholder').style.display = 'none';
  } else {
    DOM.imgRight.style.display = 'none';
    DOM.pageRight.querySelector('.page-number-badge').innerText = '';
    DOM.pageRight.querySelector('.page-placeholder').style.display = 'block';
  }
  
  // Update indicator
  if (pLeftUrl && pRightUrl) {
    DOM.readerPageIndicator.innerText = `Pages ${Math.min(pLeftNum, pRightNum)}-${Math.max(pLeftNum, pRightNum)} of ${total}`;
  } else {
    DOM.readerPageIndicator.innerText = `Page ${pLeftUrl ? pLeftNum : pRightNum} of ${total}`;
  }
  DOM.readerScrubber.value = i;
}

// --- Navigation Logic ---

// Page Forward
function pageForward() {
  const total = state.pages.length;
  const layout = state.settings.layout;
  
  if (state.currentPageIndex >= total - 1) {
    // We reached the end of the chapter! Auto trigger next chapter if exists
    if (state.nextChapterUrl) {
      if (confirm('You finished the chapter! Would you like to load the next chapter?')) {
        loadChapter(state.nextChapterUrl);
      }
    } else {
      alert('You have reached the end of this manga series!');
    }
    return;
  }
  
  triggerTurnAnimation('forward');
  
  if (layout === 'double') {
    const currentUrl = state.pages[state.currentPageIndex];
    const isCurrentLandscape = state.landscapePages[currentUrl] === true;
    
    if (isCurrentLandscape) {
      state.currentPageIndex += 1;
    } else {
      const nextUrl = state.currentPageIndex + 1 < total ? state.pages[state.currentPageIndex + 1] : null;
      const isNextLandscape = nextUrl && state.landscapePages[nextUrl] === true;
      
      if (isNextLandscape) {
        // Next page is landscape, jump exactly 1 page
        state.currentPageIndex += 1;
      } else {
        // Safe to jump 2 pages
        state.currentPageIndex += 2;
      }
    }
  } else {
    state.currentPageIndex += 1;
  }
  
  renderBookPages();
  preloadNextPages();
  
  // Save progress
  addToHistory(
    state.currentMangaUrl, 
    state.mangaTitle, 
    state.currentChapterUrl, 
    state.currentChapterTitle, 
    state.currentPageIndex, 
    state.pages.length
  );
}

// Page Backward
function pageBackward() {
  if (state.currentPageIndex <= 0) {
    if (state.prevChapterUrl) {
      if (confirm('Would you like to return to the previous chapter?')) {
        loadChapter(state.prevChapterUrl);
      }
    } else {
      alert('This is the first page of the chapter!');
    }
    return;
  }
  
  triggerTurnAnimation('backward');
  
  if (state.settings.layout === 'double') {
    // Check if 2 pages back is landscape
    const stepBack2Idx = Math.max(0, state.currentPageIndex - 2);
    const stepBack1Idx = Math.max(0, state.currentPageIndex - 1);
    
    const stepBack2Url = state.pages[stepBack2Idx];
    const isStepBack2Landscape = state.landscapePages[stepBack2Url] === true;
    
    if (isStepBack2Landscape || state.currentPageIndex === 1) {
      state.currentPageIndex = stepBack1Idx;
    } else {
      state.currentPageIndex = stepBack2Idx;
    }
  } else {
    state.currentPageIndex -= 1;
  }
  
  renderBookPages();
  preloadNextPages();
  
  // Save progress
  addToHistory(
    state.currentMangaUrl, 
    state.mangaTitle, 
    state.currentChapterUrl, 
    state.currentChapterTitle, 
    state.currentPageIndex, 
    state.pages.length
  );
}

function triggerTurnAnimation(dir) {
  const animClass = state.settings.layout === 'double' ? 'page-turn-flip' : 'page-turn-slide';
  const elements = [DOM.pageLeft, DOM.pageRight, DOM.pageCenter];
  
  elements.forEach(el => {
    if (el) {
      el.classList.remove(animClass);
      void el.offsetWidth; // Force CSS reflow ref: css-tricks.com
      el.classList.add(animClass);
    }
  });
}

// --- Setup Event Listeners ---
function setupEventListeners() {
  
  // Load manga series action
  DOM.loadMangaBtn.addEventListener('click', () => {
    const url = DOM.mangaUrlInput.value.trim();
    loadMangaChapters(url);
  });
  
  DOM.mangaUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const url = DOM.mangaUrlInput.value.trim();
      loadMangaChapters(url);
    }
  });
  
  // Theme toggling dashboard
  DOM.themeToggleBtn.addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme(state.settings.theme);
    saveSettings();
    updateSettingsUI();
  });
  
  // Preset list clicks
  DOM.presetCards.forEach(card => {
    card.addEventListener('click', () => {
      const url = card.getAttribute('data-url');
      DOM.mangaUrlInput.value = url;
      loadMangaChapters(url);
    });
  });

  // Chapter back to home button
  DOM.backToHomeBtn.addEventListener('click', () => {
    showScreen('dashboard');
  });

  // Exit reader button
  DOM.closeReaderBtn.addEventListener('click', () => {
    showScreen('chapters');
  });

  // Chapter Search filter
  DOM.chapterSearch.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const cards = DOM.chaptersList.querySelectorAll('.chapter-card');
    
    cards.forEach(card => {
      const title = card.querySelector('.font-bold').innerText.toLowerCase();
      const desc = card.querySelector('.text-gray-500').innerText.toLowerCase();
      if (title.includes(query) || desc.includes(query)) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  });

  // Reader chapters dropdown toggler
  DOM.readerChaptersDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    DOM.readerChaptersDropdown.classList.toggle('hidden');
  });
  
  // Close dropdown on click outside
  document.addEventListener('click', () => {
    DOM.readerChaptersDropdown.classList.add('hidden');
  });

  // Settings button modal toggler
  DOM.readerSettingsBtn.addEventListener('click', () => {
    DOM.settingsModal.classList.remove('hidden');
  });

  DOM.closeSettingsBtn.addEventListener('click', () => {
    DOM.settingsModal.classList.add('hidden');
  });
  
  DOM.settingsModal.addEventListener('click', (e) => {
    if (e.target === DOM.settingsModal) {
      DOM.settingsModal.classList.add('hidden');
    }
  });

  // Setup options inside Settings modal
  DOM.settingsOptionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const setting = btn.getAttribute('data-setting');
      const value = btn.getAttribute('data-value');
      
      state.settings[setting] = value;
      saveSettings();
      updateSettingsUI();
      
      if (setting === 'layout') {
        switchViewportLayout();
        renderBookPages();
      } else if (setting === 'direction') {
        renderBookPages();
      } else if (setting === 'fit') {
        applyFitMode(value);
      }
    });
  });

  DOM.settingsThemeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const value = btn.getAttribute('data-value');
      
      state.settings.theme = value;
      saveSettings();
      updateSettingsUI();
      applyTheme(value);
    });
  });

  // Navigation Areas click triggers (RTL aware!)
  DOM.navAreaLeft.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.settings.direction === 'rtl') {
      pageForward();
    } else {
      pageBackward();
    }
  });

  DOM.navAreaRight.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.settings.direction === 'rtl') {
      pageBackward();
    } else {
      pageForward();
    }
  });

  // Fullscreen support
  DOM.readerFullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  });

  // Chapter buttons at footer
  DOM.prevChapterBtn.addEventListener('click', () => {
    if (state.prevChapterUrl) loadChapter(state.prevChapterUrl);
  });

  DOM.nextChapterBtn.addEventListener('click', () => {
    if (state.nextChapterUrl) loadChapter(state.nextChapterUrl);
  });

  // Scrubber slide changes
  DOM.readerScrubber.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.currentPageIndex = val;
    renderBookPages();
  });

  // Clear History
  DOM.clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Clear your reading history?')) {
      localStorage.removeItem('manga_reader_history');
      renderHistory();
    }
  });

  // Keyboard navigation mapping
  document.addEventListener('keydown', (e) => {
    if (DOM.readerScreen.classList.contains('hidden')) return;
    
    const rtl = state.settings.direction === 'rtl';
    
    if (e.key === 'ArrowRight') {
      if (rtl) {
        pageBackward();
      } else {
        pageForward();
      }
    } else if (e.key === 'ArrowLeft') {
      if (rtl) {
        pageForward();
      } else {
        pageBackward();
      }
    } else if (e.key === 'Escape') {
      if (!DOM.settingsModal.classList.contains('hidden')) {
        DOM.settingsModal.classList.add('hidden');
      } else {
        showScreen('chapters');
      }
    } else if (e.key === 'f' || e.key === 'F') {
      DOM.readerFullscreenBtn.click();
    }
  });
}
