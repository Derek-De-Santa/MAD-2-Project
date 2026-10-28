// Shared state and helpers used by every component

const store = Vue.reactive({
  user: null,    // the logged-in user (null = logged out)
  alert: null,   // message shown at the top of the page
});

function flash(message, type = 'success') {
  store.alert = { message, type };
  setTimeout(() => { store.alert = null; }, 4000);
}

// Calls the Flask API. Throws an Error (with the server's message) if the request fails.
async function api(url, method = 'GET', body = null) {
  const options = { method, headers: {}, credentials: 'same-origin' };
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  let data = {};
  try { data = await response.json(); } catch (e) { /* no JSON body */ }

  if (!response.ok) {
    if (response.status === 401) store.user = null;   // session expired -> back to login
    throw new Error(data.error || 'Something went wrong');
  }
  return data;
}

// Runs an API call and shows an error alert if it fails.
// Returns the response data, or undefined when it failed.
async function attempt(action, showMessage = false) {
  try {
    const data = await action();
    if (showMessage && data.message) flash(data.message);
    return data;
  } catch (error) {
    flash(error.message, 'danger');
  }
}

// Bootstrap badge colour for a trek / booking status
function statusClass(status) {
  const colours = {
    Pending: 'bg-secondary', Approved: 'bg-info', Open: 'bg-success', Closed: 'bg-danger',
    Completed: 'bg-dark', Booked: 'bg-primary', Cancelled: 'bg-secondary',
  };
  return colours[status] || 'bg-secondary';
}
