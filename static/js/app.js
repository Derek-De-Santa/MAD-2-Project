// Root Vue app: shows the login page or the dashboard that matches the user's role

const app = Vue.createApp({
  data() {
    return { store, loading: true };
  },
  template: `
    <nav class="navbar navbar-dark bg-dark shadow-sm">
      <div class="container">
        <span class="navbar-brand fw-bold">TrekManager</span>
        <div v-if="store.user" class="d-flex align-items-center text-white">
          <span class="me-3 d-none d-sm-inline">
            {{ store.user.name }} <span class="badge bg-secondary">{{ store.user.role }}</span>
          </span>
          <button class="btn btn-danger btn-sm" @click="logout">Logout</button>
        </div>
      </div>
    </nav>

    <div class="container mt-4 mb-5">
      <div v-if="store.alert" class="alert alert-dismissible" :class="'alert-' + store.alert.type">
        {{ store.alert.message }}
        <button type="button" class="btn-close" @click="store.alert = null"></button>
      </div>

      <p v-if="loading" class="text-center text-muted">Loading...</p>
      <template v-else>
        <auth-page v-if="!store.user"></auth-page>
        <admin-dashboard v-else-if="store.user.role === 'admin'"></admin-dashboard>
        <staff-dashboard v-else-if="store.user.role === 'staff'"></staff-dashboard>
        <user-dashboard v-else></user-dashboard>
      </template>
    </div>`,
  async mounted() {
    // If the session cookie is still valid, go straight to the dashboard
    try {
      const data = await api('/api/me');
      store.user = data.user;
    } catch (error) { /* stay logged out */ }
    this.loading = false;
  },
  methods: {
    async logout() {
      await attempt(() => api('/api/logout', 'POST'));
      store.user = null;
    },
  },
});

// makes statusClass() usable inside every component template
app.config.globalProperties.statusClass = statusClass;

app.component('AuthPage', AuthPage);
app.component('AdminDashboard', AdminDashboard);
app.component('StaffDashboard', StaffDashboard);
app.component('UserDashboard', UserDashboard);
app.mount('#app');
