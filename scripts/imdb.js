// StreamGuide - IMDB Content Script

(function() {
  'use strict';

  const STREAMGUIDE_API = 'https://streamguide-api.onrender.com';

  // Prevent double injection
  if (document.getElementById('streamguide-container')) return;

  // Search for content by title
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

  // Get streaming availability
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
            results.push({
              ...service,
              stream_type: streamType
            });
          }
        }
      }
      return { results };
    } catch (error) {
      console.error('StreamGuide streaming error:', error);
      return null;
    }
  }

  // Group services by stream type
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

  // Extract title from IMDB page
  function getIMDBTitle() {
    // Try the main title element
    const titleEl = document.querySelector('[data-testid="hero__pageTitle"]') ||
                    document.querySelector('h1[data-testid="hero-title-block__title"]') ||
                    document.querySelector('h1');
    return titleEl ? titleEl.textContent.trim() : null;
  }

  // Detect content type from URL
  function getContentType() {
    const url = window.location.href;
    // IMDB uses /title/tt... for both, but we can check meta tags
    const typeEl = document.querySelector('meta[property="og:type"]');
    if (typeEl) {
      const type = typeEl.content;
      if (type.includes('tv')) return 'show';
    }
    // Check for episode list which indicates TV show
    if (document.querySelector('[data-testid="episodes-header"]')) return 'show';
    return 'movie';
  }

  // Find where to inject the widget on IMDB
  function findInjectionPoint() {
    // Try to find the "Watch options" or similar section
    const watchSection = document.querySelector('[data-testid="tm-box-watch-options"]');
    if (watchSection) return watchSection.parentElement;

    // Try the sidebar
    const sidebar = document.querySelector('[data-testid="hero-rating-bar__user-rating"]');
    if (sidebar) return sidebar.closest('div').parentElement;

    // Fallback to after the hero section
    const hero = document.querySelector('[data-testid="hero-title-block__title"]');
    if (hero) return hero.closest('section') || hero.parentElement;

    return null;
  }

  // Main execution
  async function init() {
    // Check if user minimized widget on this page
    const isMinimized = localStorage.getItem('streamguide-minimized-' + window.location.pathname);
    if (isMinimized === 'true') {
      console.log('StreamGuide: Widget was minimized by user, not showing');
      return;
    }

    const title = getIMDBTitle();
    if (!title) {
      console.log('StreamGuide: Could not find title on this page');
      return;
    }

    const contentType = getContentType();

    // Create container and show loading
    const container = document.createElement('div');
    container.id = 'streamguide-container';
    container.innerHTML = createLoadingWidget();
    document.body.appendChild(container);

    // Search and display
    const searchResults = await searchStreamGuide(title);

    if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
      container.innerHTML = createErrorWidget();
      return;
    }

    // Find best match
    let match = searchResults.results.find(r =>
      r.content_type === contentType || (contentType === 'show' && r.content_type === 'show')
    ) || searchResults.results[0];

    // Get streaming info
    const streamingData = await getStreaming(match.id, match.content_type);

    if (!streamingData || !streamingData.results) {
      container.innerHTML = createErrorWidget();
      return;
    }

    container.innerHTML = createWidget(streamingData.results, match.title);
    setupCloseButton();
  }

  // Wait for page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Small delay to ensure IMDB's dynamic content loads
    setTimeout(init, 1000);
  }

})();
