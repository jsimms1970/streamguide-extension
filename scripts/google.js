// StreamGuide - Google Search Content Script

(function() {
  'use strict';

  const STREAMGUIDE_API = 'https://streamguide-api.onrender.com';

  if (document.getElementById('streamguide-container')) return;

  async function searchStreamGuide(query) {
    try {
      const response = await fetch(`${STREAMGUIDE_API}/v1/search?q=${encodeURIComponent(query)}`);
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

  // Check if Google search is for a movie/show
  function isMovieOrShowSearch() {
    const query = new URLSearchParams(window.location.search).get('q') || '';
    const lowerQuery = query.toLowerCase();

    // Check for explicit movie/show keywords
    const movieKeywords = ['movie', 'film', 'watch', 'streaming', 'netflix', 'hulu', 'disney+', 'hbo', 'amazon prime'];
    if (movieKeywords.some(kw => lowerQuery.includes(kw))) return true;

    // Check if Google shows a knowledge panel for a movie/show
    const knowledgePanel = document.querySelector('[data-attrid="kc:/film/film:reviews"]') ||
                          document.querySelector('[data-attrid="kc:/tv/tv_program:reviews"]') ||
                          document.querySelector('[data-attrid="hw:/collection/films:watch providers"]') ||
                          document.querySelector('[data-attrid="kc:/film/film:director"]') ||
                          document.querySelector('[data-attrid="kc:/tv/tv_program:seasons"]');

    return !!knowledgePanel;
  }

  // Extract title from Google search
  function getGoogleTitle() {
    // Get from knowledge panel title
    const kpTitle = document.querySelector('[data-attrid="title"]') ||
                    document.querySelector('h2[data-attrid="title"]');
    if (kpTitle) return kpTitle.textContent.trim();

    // Fallback to search query, cleaned up
    const query = new URLSearchParams(window.location.search).get('q') || '';
    // Remove common suffixes
    return query.replace(/\s+(movie|film|show|tv|watch|streaming|netflix|where to watch)$/i, '').trim();
  }

  function findInjectionPoint() {
    // Try to find the knowledge panel
    const kp = document.querySelector('[data-attrid="kc:/film/film:reviews"]')?.closest('.kp-wholepage') ||
               document.querySelector('[data-attrid="kc:/tv/tv_program:reviews"]')?.closest('.kp-wholepage') ||
               document.querySelector('.kp-wholepage');

    if (kp) return kp;

    // Right sidebar
    const rightPanel = document.querySelector('#rhs') || document.querySelector('[id="rhs"]');
    if (rightPanel) return rightPanel;

    // Above search results
    const searchResults = document.querySelector('#search');
    return searchResults;
  }

  async function init() {
    // Check if user minimized widget on this page
    const isMinimized = localStorage.getItem('streamguide-minimized-' + window.location.pathname);
    if (isMinimized === 'true') {
      console.log('StreamGuide: Widget was minimized by user, not showing');
      return;
    }

    // Only run if this looks like a movie/show search
    if (!isMovieOrShowSearch()) {
      console.log('StreamGuide: Not a movie/show search');
      return;
    }

    const title = getGoogleTitle();
    if (!title) {
      console.log('StreamGuide: Could not find title');
      return;
    }

    const container = document.createElement('div');
    container.id = 'streamguide-container';
    container.innerHTML = createLoadingWidget();
    document.body.appendChild(container);

    const searchResults = await searchStreamGuide(title);

    if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
      container.innerHTML = createErrorWidget();
      return;
    }

    const match = searchResults.results[0];
    const streamingData = await getStreaming(match.id, match.content_type);

    if (!streamingData || !streamingData.results) {
      container.innerHTML = createErrorWidget();
      return;
    }

    container.innerHTML = createWidget(streamingData.results, match.title);
    setupCloseButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }

})();
