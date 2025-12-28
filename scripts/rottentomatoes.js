// StreamGuide - Rotten Tomatoes Content Script

console.log('StreamGuide: Rotten Tomatoes script loaded');

(function() {
  'use strict';

  console.log('StreamGuide: Starting on', window.location.href);

  const STREAMGUIDE_API = 'https://streamguide-api.onrender.com';

  if (document.getElementById('streamguide-container')) {
    console.log('StreamGuide: Widget already exists, skipping');
    return;
  }

  async function searchStreamGuide(query) {
    try {
      const url = `${STREAMGUIDE_API}/v1/search?q=${encodeURIComponent(query)}`;
      console.log('StreamGuide: Fetching:', url);
      const response = await fetch(url);
      console.log('StreamGuide: Response status:', response.status);
      if (!response.ok) throw new Error('API request failed');
      return await response.json();
    } catch (error) {
      console.error('StreamGuide search error:', error);
      return null;
    }
  }

  async function getStreaming(contentId, contentType) {
    try {
      const endpoint = contentType === 'movie' ? 'movies' : 'shows';
      const response = await fetch(`${STREAMGUIDE_API}/v1/${endpoint}/${contentId}/streaming`);
      if (!response.ok) throw new Error('API request failed');
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
      console.error('StreamGuide streaming error:', error);
      return null;
    }
  }

  function groupByStreamType(services) {
    const groups = { subscription: [], free: [], ads: [], rent: [], buy: [] };
    services.forEach(service => {
      const type = service.stream_type || 'subscription';
      if (groups[type]) groups[type].push(service);
    });
    return groups;
  }

  function getStreamTypeLabel(type) {
    const labels = { subscription: 'Streaming', free: 'Free', ads: 'Free with Ads', rent: 'Rent', buy: 'Buy' };
    return labels[type] || type;
  }

  function createWidget(services, title) {
    const grouped = groupByStreamType(services);
    let sectionsHtml = '';

    for (const [type, typeServices] of Object.entries(grouped)) {
      if (typeServices.length === 0) continue;

      const servicesHtml = typeServices.map(service => `
        <a href="${service.link || '#'}" target="_blank" rel="noopener noreferrer"
           class="streamguide-service" data-type="${type}" title="${service.service_name} (${getStreamTypeLabel(type)})">
          ${service.service_logo ? `<img src="${service.service_logo}" class="streamguide-service-logo" alt="">` : ''}
          <span class="streamguide-service-name">${service.service_name}</span>
        </a>
      `).join('');

      sectionsHtml += `
        <div class="streamguide-section">
          <div class="streamguide-section-title">${getStreamTypeLabel(type)}</div>
          <div class="streamguide-services">${servicesHtml}</div>
        </div>
      `;
    }

    if (!sectionsHtml) {
      sectionsHtml = '<div class="streamguide-empty">No streaming information available</div>';
    }

    return `
      <div class="streamguide-widget">
        <button class="streamguide-close" id="streamguide-close" title="Close">×</button>
        <div class="streamguide-header">
          <div class="streamguide-logo">S</div>
          <div>
            <div class="streamguide-title">Where to Watch</div>
            <div class="streamguide-subtitle">${title}</div>
          </div>
        </div>
        ${sectionsHtml}
        <div class="streamguide-powered">
          Powered by <a href="https://rapidapi.com/jsimms1970/api/streamguide" target="_blank">StreamGuide API</a>
        </div>
      </div>
    `;
  }

  function setupCloseButton() {
    const closeBtn = document.getElementById('streamguide-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        const container = document.getElementById('streamguide-container');
        if (container) {
          container.classList.add('minimized');
          // Store minimized state for this page
          localStorage.setItem('streamguide-minimized-' + window.location.pathname, 'true');
        }
      });
    }
  }

  function createLoadingWidget() {
    return `
      <div class="streamguide-widget">
        <div class="streamguide-header">
          <div class="streamguide-logo">S</div>
          <div>
            <div class="streamguide-title">Where to Watch</div>
            <div class="streamguide-subtitle">Loading...</div>
          </div>
        </div>
        <div class="streamguide-loading">
          <div class="streamguide-spinner"></div>
          <span>Finding streaming options...</span>
        </div>
      </div>
    `;
  }

  function createErrorWidget() {
    return `
      <div class="streamguide-widget">
        <div class="streamguide-header">
          <div class="streamguide-logo">S</div>
          <div><div class="streamguide-title">Where to Watch</div></div>
        </div>
        <div class="streamguide-error">Unable to load streaming information</div>
        <div class="streamguide-powered">
          Powered by <a href="https://rapidapi.com/jsimms1970/api/streamguide" target="_blank">StreamGuide API</a>
        </div>
      </div>
    `;
  }

  // Extract title from Rotten Tomatoes
  function getRTTitle() {
    // Try various selectors for movie/TV titles
    const selectors = [
      '[data-qa="score-panel-title"]',
      '[data-qa="score-panel-series-title"]',
      'h1[slot="title"]',
      'h1[slot="titleIntro"]',
      'h1.title',
      '.scoreboard__title',
      'h1'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        console.log('StreamGuide: Found title with selector:', selector);
        return el.textContent.trim();
      }
    }

    // Try getting from page title
    const pageTitle = document.title.replace(/ - Rotten Tomatoes$/, '').trim();
    if (pageTitle) return pageTitle;

    return null;
  }

  function getContentType() {
    return window.location.pathname.startsWith('/tv/') ? 'show' : 'movie';
  }

  function findInjectionPoint() {
    // Try various injection points
    const selectors = [
      '[data-qa="where-to-watch-section"]',
      '[data-qa="score-panel"]',
      '.scoreboard',
      'section[data-qa="critics-score"]',
      'aside',
      'main',
      '#main-page-content',
      'body'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        console.log('StreamGuide: Found injection point with selector:', selector);
        return el;
      }
    }

    return document.body;
  }

  async function init() {
    // Check if user minimized widget on this page
    const isMinimized = localStorage.getItem('streamguide-minimized-' + window.location.pathname);
    if (isMinimized === 'true') {
      console.log('StreamGuide: Widget was minimized by user, not showing');
      return;
    }

    const title = getRTTitle();
    if (!title) {
      console.log('StreamGuide: Could not find title on this page');
      return;
    }

    console.log('StreamGuide: Searching for:', title);

    const contentType = getContentType();
    console.log('StreamGuide: Content type:', contentType);

    const injectionPoint = findInjectionPoint();

    if (!injectionPoint) {
      console.log('StreamGuide: Could not find injection point');
      return;
    }

    const container = document.createElement('div');
    container.id = 'streamguide-container';
    container.innerHTML = createLoadingWidget();
    // Append to body - CSS will position it fixed in bottom-right
    document.body.appendChild(container);
    console.log('StreamGuide: Widget inserted');

    const searchResults = await searchStreamGuide(title);
    console.log('StreamGuide: Search results:', searchResults);

    if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
      console.log('StreamGuide: No search results found');
      container.innerHTML = createErrorWidget();
      return;
    }

    let match = searchResults.results.find(r =>
      r.content_type === contentType || (contentType === 'show' && r.content_type === 'show')
    ) || searchResults.results[0];

    console.log('StreamGuide: Best match:', match);

    const streamingData = await getStreaming(match.id, match.content_type);
    console.log('StreamGuide: Streaming data:', streamingData);

    if (!streamingData || !streamingData.results) {
      console.log('StreamGuide: No streaming data found');
      container.innerHTML = createErrorWidget();
      return;
    }

    console.log('StreamGuide: Rendering widget with', streamingData.results.length, 'services');
    container.innerHTML = createWidget(streamingData.results, match.title);
    setupCloseButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1000);
  }

})();
