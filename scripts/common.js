// StreamGuide Common Functions

const STREAMGUIDE_API = 'https://streamguide-api.onrender.com';

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

// Get streaming availability for content
async function getStreaming(contentId, contentType) {
  try {
    const endpoint = contentType === 'movie' ? 'movies' : 'shows';
    const response = await fetch(`${STREAMGUIDE_API}/v1/${endpoint}/${contentId}/streaming`);
    if (!response.ok) throw new Error('API request failed');
    return await response.json();
  } catch (error) {
    console.error('StreamGuide streaming error:', error);
    return null;
  }
}

// Group services by stream type
function groupByStreamType(services) {
  const groups = {
    subscription: [],
    free: [],
    ads: [],
    rent: [],
    buy: []
  };

  services.forEach(service => {
    const type = service.stream_type || 'subscription';
    if (groups[type]) {
      groups[type].push(service);
    }
  });

  return groups;
}

// Get friendly label for stream type
function getStreamTypeLabel(type) {
  const labels = {
    subscription: 'Streaming',
    free: 'Free',
    ads: 'Free with Ads',
    rent: 'Rent',
    buy: 'Buy'
  };
  return labels[type] || type;
}

// Create the widget HTML
function createWidget(services, title) {
  const grouped = groupByStreamType(services);

  let sectionsHtml = '';

  for (const [type, typeServices] of Object.entries(grouped)) {
    if (typeServices.length === 0) continue;

    const servicesHtml = typeServices.map(service => `
      <a href="${service.link || '#'}"
         target="_blank"
         rel="noopener noreferrer"
         class="streamguide-service"
         data-type="${type}"
         title="${service.service_name} (${getStreamTypeLabel(type)})">
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

// Create loading widget
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

// Create error widget
function createErrorWidget() {
  return `
    <div class="streamguide-widget">
      <div class="streamguide-header">
        <div class="streamguide-logo">S</div>
        <div>
          <div class="streamguide-title">Where to Watch</div>
        </div>
      </div>
      <div class="streamguide-error">Unable to load streaming information</div>
      <div class="streamguide-powered">
        Powered by <a href="https://rapidapi.com/jsimms1970/api/streamguide" target="_blank">StreamGuide API</a>
      </div>
    </div>
  `;
}

// Main function to fetch and display streaming info
async function showStreamingInfo(title, contentType, containerElement) {
  // Insert loading widget
  const widgetContainer = document.createElement('div');
  widgetContainer.id = 'streamguide-container';
  widgetContainer.innerHTML = createLoadingWidget();
  containerElement.appendChild(widgetContainer);

  // Search for the content
  const searchResults = await searchStreamGuide(title);

  if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
    widgetContainer.innerHTML = createErrorWidget();
    return;
  }

  // Find best match (prefer matching content type)
  let match = searchResults.results.find(r =>
    r.content_type === contentType ||
    (contentType === 'tv' && r.content_type === 'show')
  );

  if (!match) {
    match = searchResults.results[0];
  }

  // Get streaming info
  const streamingData = await getStreaming(match.id, match.content_type);

  if (!streamingData || !streamingData.results) {
    widgetContainer.innerHTML = createErrorWidget();
    return;
  }

  // Display the widget
  widgetContainer.innerHTML = createWidget(streamingData.results, match.title);
}
