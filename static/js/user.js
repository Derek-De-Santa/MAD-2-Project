// ---------------- Browse, search and book treks ----------------

const UserTreks = {
  props: ['bookings'],
  emits: ['changed'],
  data() {
    return { treks: [], filters: { location: '', difficulty: '', duration: '' } };
  },
  template: `
    <div class="card shadow mb-4">
      <div class="card-body bg-light">
        <form class="row g-3 align-items-end" @submit.prevent="load">
          <div class="col-md-4">
            <label class="form-label">Location</label>
            <input v-model.trim="filters.location" class="form-control" placeholder="e.g. Himalayas">
          </div>
          <div class="col-md-3">
            <label class="form-label">Difficulty</label>
            <select v-model="filters.difficulty" class="form-select">
              <option value="">Any</option>
              <option>Easy</option><option>Moderate</option><option>Hard</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Max duration (days)</label>
            <input v-model="filters.duration" type="number" min="1" class="form-control" placeholder="Any">
          </div>
          <div class="col-md-2 d-grid gap-1">
            <button class="btn btn-secondary">Search</button>
          </div>
        </form>
      </div>
    </div>

    <div class="row">
      <div class="col-md-6 col-lg-4 mb-4" v-for="t in treks" :key="t.id">
        <div class="card h-100 shadow-sm border-success">
          <div class="card-body d-flex flex-column">
            <div class="d-flex justify-content-between">
              <h5 class="card-title">{{ t.name }}</h5>
              <span class="badge align-self-start" :class="statusClass(t.status)">{{ t.status }}</span>
            </div>
            <h6 class="card-subtitle mb-2 text-muted">{{ t.location }}</h6>
            <p class="card-text mb-2">
              <strong>Difficulty:</strong> {{ t.difficulty }}<br>
              <strong>Duration:</strong> {{ t.duration_days }} day(s)<br>
              <strong>Dates:</strong> {{ t.start_date }} to {{ t.end_date }}
            </p>
            <p class="small text-muted" v-if="t.description">{{ t.description }}</p>
            <div class="alert alert-info py-1 text-center mt-auto">
              <strong>{{ t.available_slots }} / {{ t.total_slots }}</strong> slots left
            </div>
            <button class="btn w-100" :class="buttonState(t).class" :disabled="buttonState(t).disabled"
                    @click="book(t)">{{ buttonState(t).label }}</button>
          </div>
        </div>
      </div>
      <p v-if="!treks.length" class="text-muted">No treks found matching your search.</p>
    </div>`,
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      const f = this.filters;
      const params = `location=${encodeURIComponent(f.location)}&difficulty=${f.difficulty}&duration=${f.duration}`;
      const data = await attempt(() => api('/api/user/treks?' + params));
      if (data) this.treks = data.treks;
    },
    isBooked(trek) {
      return this.bookings.some(b => b.trek_id === trek.id && (b.status === 'Booked' || b.status === 'Completed'));
    },
    buttonState(trek) {
      if (this.isBooked(trek)) return { label: 'Already Booked', disabled: true, class: 'btn-secondary' };
      if (trek.status !== 'Open') return { label: 'Not Open Yet', disabled: true, class: 'btn-secondary' };
      if (trek.available_slots < 1) return { label: 'Full', disabled: true, class: 'btn-secondary' };
      return { label: 'Book Now', disabled: false, class: 'btn-success' };
    },
    async book(trek) {
      const data = await attempt(() => api('/api/user/bookings', 'POST', { trek_id: trek.id }), true);
      this.load();
      if (data) this.$emit('changed');
    },
  },
};


// ---------------- Table of bookings (used for "My Bookings" and "History") ----------------

const UserBookings = {
  props: ['bookings', 'canCancel'],
  emits: ['changed'],
  template: `
    <div class="table-responsive">
      <table class="table table-striped align-middle bg-white shadow-sm">
        <thead class="table-dark">
          <tr><th>Trek</th><th>Dates</th><th>Booked On</th><th>Booking</th><th>Trek Status</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="b in bookings" :key="b.id">
            <td><strong>{{ b.trek_name }}</strong><br><small class="text-muted">{{ b.location }}</small></td>
            <td><small>{{ b.start_date }} to {{ b.end_date }}</small></td>
            <td><small>{{ b.booking_date }}</small></td>
            <td><span class="badge" :class="statusClass(b.status)">{{ b.status }}</span></td>
            <td><span class="badge" :class="statusClass(b.trek_status)">{{ b.trek_status }}</span></td>
            <td>
              <button v-if="canCancel" class="btn btn-sm btn-outline-danger" @click="cancel(b)">Cancel</button>
            </td>
          </tr>
          <tr v-if="!bookings.length"><td colspan="6" class="text-center text-muted">Nothing here yet.</td></tr>
        </tbody>
      </table>
    </div>`,
  methods: {
    async cancel(booking) {
      if (!confirm(`Cancel your booking for "${booking.trek_name}"?`)) return;
      const data = await attempt(() => api(`/api/user/bookings/${booking.id}/cancel`, 'POST'), true);
      if (data) this.$emit('changed');
    },
  },
};


// ---------------- Edit profile ----------------

const UserProfile = {
  data() {
    return {
      form: {
        name: store.user.name,
        contact_details: store.user.contact_details || '',
        new_password: '',
      },
    };
  },
  template: `
    <div class="row">
      <div class="col-md-6">
        <div class="card shadow">
          <div class="card-header bg-dark text-white">My Profile</div>
          <div class="card-body">
            <form @submit.prevent="save">
              <div class="mb-3">
                <label class="form-label">Email (cannot be changed)</label>
                <input :value="store.user.email" class="form-control" disabled>
              </div>
              <div class="mb-3">
                <label class="form-label">Full Name</label>
                <input v-model.trim="form.name" class="form-control" required maxlength="100">
              </div>
              <div class="mb-3">
                <label class="form-label">Contact Number</label>
                <input v-model.trim="form.contact_details" class="form-control"
                       pattern="[0-9+]{7,15}" title="7 to 15 digits">
              </div>
              <div class="mb-3">
                <label class="form-label">New Password (leave empty to keep the current one)</label>
                <input v-model="form.new_password" type="password" class="form-control" minlength="6">
              </div>
              <button class="btn btn-primary">Save Profile</button>
            </form>
          </div>
        </div>
      </div>
    </div>`,
  computed: {
    store() { return store; },
  },
  methods: {
    async save() {
      const data = await attempt(() => api('/api/me', 'PUT', this.form), true);
      if (data) {
        store.user = data.user;
        this.form.new_password = '';
      }
    },
  },
};


// ---------------- Notifications (booking alerts + "CSV is ready") ----------------

const UserNotifications = {
  props: ['notifications'],
  emits: ['read'],
  template: `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="mb-0">Notifications</h5>
      <button class="btn btn-sm btn-outline-secondary" @click="$emit('read')">Mark all as read</button>
    </div>
    <ul class="list-group shadow-sm">
      <li class="list-group-item d-flex justify-content-between align-items-center"
          v-for="n in notifications" :key="n.id" :class="{ 'fw-bold': !n.is_read }">
        <span>
          {{ n.message }}
          <small class="text-muted fw-normal d-block">{{ n.created_at }}</small>
        </span>
        <a v-if="n.filename" :href="'/api/user/exports/' + n.filename" class="btn btn-sm btn-success">Download CSV</a>
      </li>
      <li v-if="!notifications.length" class="list-group-item text-muted">No notifications yet.</li>
    </ul>`,
};


// ---------------- User dashboard ----------------

const UserDashboard = {
  components: { UserTreks, UserBookings, UserProfile, UserNotifications },
  data() {
    return {
      tab: 'treks', bookings: [], notifications: [],
      timer: null, firstLoad: true,
    };
  },
  template: `
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
      <div>
        <h2 class="text-success mb-0">Trekker Dashboard</h2>
        <p class="text-muted mb-0">Find your next adventure and manage your bookings.</p>
      </div>
      <button class="btn btn-outline-success" @click="exportCsv">Export Booking History (CSV)</button>
    </div>

    <ul class="nav nav-tabs my-4">
      <li class="nav-item">
        <a href="#" class="nav-link" :class="{ active: tab === 'treks' }" @click.prevent="tab = 'treks'">Available Treks</a>
      </li>
      <li class="nav-item">
        <a href="#" class="nav-link" :class="{ active: tab === 'bookings' }" @click.prevent="tab = 'bookings'">
          My Bookings <span class="badge bg-primary">{{ activeBookings.length }}</span>
        </a>
      </li>
      <li class="nav-item">
        <a href="#" class="nav-link" :class="{ active: tab === 'history' }" @click.prevent="tab = 'history'">Trekking History</a>
      </li>
      <li class="nav-item">
        <a href="#" class="nav-link" :class="{ active: tab === 'notifications' }" @click.prevent="tab = 'notifications'">
          Notifications <span v-if="unread" class="badge bg-danger">{{ unread }}</span>
        </a>
      </li>
      <li class="nav-item">
        <a href="#" class="nav-link" :class="{ active: tab === 'profile' }" @click.prevent="tab = 'profile'">Profile</a>
      </li>
    </ul>

    <user-treks v-if="tab === 'treks'" :bookings="bookings" @changed="loadBookings"></user-treks>
    <user-bookings v-else-if="tab === 'bookings'" :bookings="activeBookings" :can-cancel="true"
                   @changed="loadBookings"></user-bookings>
    <user-bookings v-else-if="tab === 'history'" :bookings="historyBookings" :can-cancel="false"></user-bookings>
    <user-notifications v-else-if="tab === 'notifications'" :notifications="notifications"
                        @read="markRead"></user-notifications>
    <user-profile v-else></user-profile>`,
  computed: {
    activeBookings() { return this.bookings.filter(b => b.status === 'Booked'); },
    historyBookings() { return this.bookings.filter(b => b.status !== 'Booked'); },
    unread() { return this.notifications.filter(n => !n.is_read).length; },
  },
  async mounted() {
    await this.loadBookings();
    await this.loadNotifications();
    this.firstLoad = false;
    // check for new notifications every 5 seconds (this is how the user sees "your CSV is ready")
    this.timer = setInterval(this.loadNotifications, 5000);
  },
  beforeUnmount() {
    clearInterval(this.timer);
  },
  methods: {
    async loadBookings() {
      const data = await attempt(() => api('/api/user/bookings'));
      if (data) this.bookings = data.bookings;
    },
    async loadNotifications() {
      try {
        const data = await api('/api/user/notifications');
        const before = this.unread;
        this.notifications = data.notifications;
        const newest = this.notifications[0];
        if (!this.firstLoad && this.unread > before && newest.filename) {
          flash(newest.message, 'info');   // pop-up alert when an export finishes
        }
      } catch (error) { /* ignore: polling should stay silent */ }
    },
    async markRead() {
      await attempt(() => api('/api/user/notifications/read', 'POST'));
      this.loadNotifications();
    },
    async exportCsv() {
      await attempt(() => api('/api/user/export', 'POST'), true);
    },
  },
};
