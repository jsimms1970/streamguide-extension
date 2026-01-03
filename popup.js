// StreamGuide Popup

const STREAMGUIDE_API = 'https://streamguide-api.onrender.com';

const searchInput = document.getElementById('searchInput');
const resultsDiv = document.getElementById('results');
const showWidgetBtn = document.getElementById('showWidgetBtn');
const serviceFilter = document.getElementById('serviceFilter');
const tabs = document.querySelectorAll('.tab');
const searchTab = document.getElementById('searchTab');
const newTab = document.getElementById('newTab');

let searchTimeout = null;
let currentResults = [];
let currentTab = 'search';

// Check if current tab is a supported site
async function checkSupportedSite() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const url = tab.url;
      const isSupported =
        url.includes('imdb.com/title/') ||
        url.includes('rottentomatoes.com/m/') ||
        url.includes('rottentomatoes.com/tv/') ||
        (url.includes('google.com/search') && url.includes('q='));

      if (isSupported) {
        showWidgetBtn.style.display = 'block';
      } else {
        showWidgetBtn.style.display = 'none';
      }
    }
  } catch (error) {
    showWidgetBtn.style.display = 'none';
  }
}

// Check on load
checkSupportedSite();

// Search API
async function search(query) {
  try {
    const response = await fetch(`${STREAMGUIDE_API}/v1/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Search failed');
    return await response.json();
  } catch (error) {
    console.error('Search error:', error);
    return null;
  }
}

// Get streaming availability
async function getStreaming(contentId, contentType) {
  try {
    const endpoint = contentType === 'movie' ? 'movies' : 'shows';
    const response = await fetch(`${STREAMGUIDE_API}/v1/${endpoint}/${contentId}/streaming`);
    if (!response.ok) throw new Error('Streaming fetch failed');
    const data = await response.json();

    // Flatten providers object into results array
    const results = [];
    if (data.providers) {
      for (const [streamType, services] of Object.entries(data.providers)) {
        for (const service of services) {
          results.push({ ...service, stream_type: streamType });
        }
      }
    }
    return { results };
  } catch (error) {
    console.error('Streaming error:', error);
    return null;
  }
}

// Show loading
function showLoading() {
  resultsDiv.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <span>Searching...</span>
    </div>
  `;
}

// Show search results
function showResults(results) {
  currentResults = results;

  if (!results || results.length === 0) {
    resultsDiv.innerHTML = '<div class="empty">No results found</div>';
    return;
  }

  resultsDiv.innerHTML = results.slice(0, 5).map((item, index) => `
    <div class="result-item" data-index="${index}">
      <div class="result-title">${item.title}</div>
      <div class="result-meta">${item.content_type === 'movie' ? 'Movie' : 'TV Show'}${item.year ? ` • ${item.year}` : ''}</div>
    </div>
  `).join('');

  // Add click handlers
  document.querySelectorAll('.result-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index);
      selectResult(index);
    });
  });
}

// Select a result and show streaming info
async function selectResult(index) {
  const item = currentResults[index];
  if (!item) return;

  // Highlight selected
  document.querySelectorAll('.result-item').forEach((el, i) => {
    el.classList.toggle('selected', i === index);
  });

  // Remove existing streaming section
  const existingStreaming = document.querySelector('.streaming-section');
  if (existingStreaming) existingStreaming.remove();

  // Add loading
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'streaming-section';
  loadingDiv.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading streaming options...</span>
    </div>
  `;
  resultsDiv.appendChild(loadingDiv);

  // Fetch streaming data
  const streamingData = await getStreaming(item.id, item.content_type);

  if (!streamingData || !streamingData.results || streamingData.results.length === 0) {
    loadingDiv.innerHTML = '<div class="empty">No streaming options found</div>';
    return;
  }

  // Group by type
  const grouped = {};
  streamingData.results.forEach(service => {
    const type = service.stream_type || 'subscription';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(service);
  });

  const typeLabels = {
    subscription: 'Streaming',
    free: 'Free',
    ads: 'Free with Ads',
    rent: 'Rent',
    buy: 'Buy'
  };

  let html = '';
  for (const [type, services] of Object.entries(grouped)) {
    html += `
      <div class="section-title">${typeLabels[type] || type}</div>
      <div class="services">
        ${services.map(service => `
          <a href="${service.link || '#'}" target="_blank" class="service" data-type="${type}">
            ${service.service_logo ? `<img src="${service.service_logo}" class="service-logo" alt="">` : ''}
            <span>${service.service_name}</span>
          </a>
        `).join('')}
      </div>
    `;
  }

  loadingDiv.innerHTML = html;
}

// Handle search input
searchInput.addEventListener('input', (e) => {
  const query = e.target.value.trim();

  if (searchTimeout) clearTimeout(searchTimeout);

  if (query.length < 2) {
    resultsDiv.innerHTML = '';
    return;
  }

  showLoading();

  // Debounce search
  searchTimeout = setTimeout(async () => {
    const data = await search(query);
    if (data && data.results) {
      showResults(data.results);
    } else {
      resultsDiv.innerHTML = '<div class="empty">Search failed. Please try again.</div>';
    }
  }, 300);
});

// Handle enter key
searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && currentResults.length > 0) {
    selectResult(0);
  }
});

// Show widget button - clears minimized state and reloads page
document.getElementById('showWidgetBtn').addEventListener('click', async () => {
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const url = new URL(tab.url);
      const pathname = url.pathname;

      // Execute script to clear the minimized state
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (path) => {
          localStorage.removeItem('streamguide-minimized-' + path);
          location.reload();
        },
        args: [pathname]
      });

      window.close();
    }
  } catch (error) {
    console.error('Error showing widget:', error);
  }
});

// ===== WHAT'S NEW TAB =====

// Fetch available services
async function loadServices() {
  try {
    const response = await fetch(`${STREAMGUIDE_API}/v1/trending/services?country=US`);
    if (!response.ok) throw new Error('Failed to load services');
    const data = await response.json();

    // Populate dropdown with top services
    data.services.slice(0, 15).forEach(service => {
      const option = document.createElement('option');
      option.value = service.service_name;
      option.textContent = `${service.service_name} (${service.title_count})`;
      serviceFilter.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading services:', error);
  }
}

// Fetch trending content
async function loadTrendingContent(serviceName = '') {
  resultsDiv.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading trending titles...</span>
    </div>
  `;

  try {
    let url = `${STREAMGUIDE_API}/v1/trending?limit=20`;
    if (serviceName) {
      url += `&service=${encodeURIComponent(serviceName)}`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to load trending content');
    const data = await response.json();

    showTrendingContent(data.results);
  } catch (error) {
    console.error('Error loading trending content:', error);
    resultsDiv.innerHTML = '<div class="empty">Failed to load trending titles</div>';
  }
}

// Display trending content
function showTrendingContent(items) {
  if (!items || items.length === 0) {
    resultsDiv.innerHTML = '<div class="empty">No trending titles found</div>';
    return;
  }

  resultsDiv.innerHTML = items.map((item, index) => `
    <div class="new-item" data-index="${index}">
      ${item.poster_url
        ? `<img src="${item.poster_url}" class="new-item-poster" alt="">`
        : '<div class="new-item-poster"></div>'}
      <div class="new-item-info">
        <div class="new-item-title">${item.title}</div>
        <div class="new-item-meta">${item.content_type === 'movie' ? 'Movie' : 'TV Show'}${item.year ? ` • ${item.year}` : ''}${item.vote_average ? ` • ⭐ ${item.vote_average.toFixed(1)}` : ''}</div>
        <span class="new-item-service">${item.service_name}</span>
      </div>
    </div>
  `).join('');

  // Store for click handling
  currentResults = items.map(item => ({
    id: item.id,
    tmdb_id: item.tmdb_id,
    title: item.title,
    content_type: item.content_type,
    year: item.year
  }));

  // Add click handlers
  document.querySelectorAll('.new-item').forEach(el => {
    el.addEventListener('click', () => {
      const index = parseInt(el.dataset.index);
      selectResult(index);
    });
  });
}

// Tab switching
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;

    // Update active tab
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Show/hide content
    if (tabName === 'search') {
      searchTab.style.display = 'block';
      newTab.style.display = 'none';
      resultsDiv.innerHTML = '';
      currentTab = 'search';
      searchInput.focus();
    } else {
      searchTab.style.display = 'none';
      newTab.style.display = 'block';
      currentTab = 'trending';
      loadTrendingContent(serviceFilter.value);
    }
  });
});

// Service filter change
serviceFilter.addEventListener('change', () => {
  loadTrendingContent(serviceFilter.value);
});

// Load services on startup
loadServices();
