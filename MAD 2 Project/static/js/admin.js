// ---------------- Overview: statistics + Chart.js charts ----------------

const AdminOverview = {
  data() {
    return { stats: null };
  },
  template: `
    <div v-if="stats">
      <div class="row">
        <div class="col-6 col-md-3 mb-3" v-for="card in cards" :key="card.label">
          <div class="card text-white shadow" :class="card.color">
            <div class="card-body">
              <h6>{{ card.label }}</h6>
              <h2 class="mb-0">{{ card.value }}</h2>
            </div>
          </div>
        </div>
      </div>
      <div class="row">
        <div class="col-md-7 mb-4">
          <div class="card shadow">
            <div class="card-header">Popular Treks (by bookings)</div>
            <div class="card-body"><canvas ref="popularChart"></canvas></div>
          </div>
        </div>
        <div class="col-md-5 mb-4">
          <div class="card shadow">
            <div class="card-header">Bookings by Status</div>
            <div class="card-body"><canvas ref="statusChart"></canvas></div>
          </div>
        </div>
      </div>
    </div>`,
  computed: {
    cards() {
      return [
        { label: 'Total Treks', value: this.stats.total_treks, color: 'bg-info' },
        { label: 'Total Users', value: this.stats.total_users, color: 'bg-success' },
        { label: 'Total Staff', value: this.stats.total_staff, color: 'bg-primary' },
        { label: 'Total Bookings', value: this.stats.total_bookings, color: 'bg-warning' },
      ];
    },
  },
  async mounted() {
    const data = await attempt(() => api('/api/admin/stats'));
    if (!data) return;
    this.stats = data;
    this.$nextTick(() => this.drawCharts());   // wait until the <canvas> elements exist
  },
  methods: {
    drawCharts() {
      const popular = this.stats.popular_treks;
      new Chart(this.$refs.popularChart, {
        type: 'bar',
        data: {
          labels: popular.map(t => t.name),
          datasets: [{ label: 'Bookings', data: popular.map(t => t.bookings), backgroundColor: '#0d6efd' }],
        },
        options: {
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        },
      });

      const byStatus = this.stats.bookings_by_status;
      new Chart(this.$refs.statusChart, {
        type: 'doughnut',
        data: {
          labels: Object.keys(byStatus),
          datasets: [{ data: Object.values(byStatus), backgroundColor: ['#0d6efd', '#6c757d', '#198754'] }],
        },
      });
    },
  },
};


// ---------------- Treks: create, edit, delete, assign staff, search ----------------

function blankTrekForm() {
  return {
    name: '', location: '', difficulty: 'Easy', total_slots: 10,
    start_date: '', end_date: '', description: '', instructions: '',
    staff_id: '', status: 'Pending',
  };
}

const AdminTreks = {
  data() {
    return {
      treks: [], staff: [], q: '',
      showForm: false, editId: null, form: blankTrekForm(),
      statuses: ['Pending', 'Approved', 'Open', 'Closed', 'Completed'],
    };
  },
  template: `
    <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
      <form class="d-flex" @submit.prevent="load">
        <input v-model="q" class="form-control me-2" placeholder="Search by name or location">
        <button class="btn btn-secondary">Search</button>
      </form>
      <button class="btn btn-primary" @click="openForm()">+ Create Trek</button>
    </div>

    <div v-if="showForm" class="card shadow mb-4">
      <div class="card-header bg-primary text-white">{{ editId ? 'Edit Trek' : 'Create New Trek' }}</div>
      <div class="card-body">
        <form @submit.prevent="save">
          <div class="row mb-3">
            <div class="col-md-6">
              <label class="form-label">Trek Name</label>
              <input v-model.trim="form.name" class="form-control" required maxlength="150">
            </div>
            <div class="col-md-6">
              <label class="form-label">Location</label>
              <input v-model.trim="form.location" class="form-control" required maxlength="150">
            </div>
          </div>
          <div class="row mb-3">
            <div class="col-md-3">
              <label class="form-label">Difficulty</label>
              <select v-model="form.difficulty" class="form-select">
                <option>Easy</option><option>Moderate</option><option>Hard</option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Total Slots</label>
              <input v-model.number="form.total_slots" type="number" min="1" class="form-control" required>
            </div>
            <div class="col-md-3">
              <label class="form-label">Start Date</label>
              <input v-model="form.start_date" type="date" class="form-control" required>
            </div>
            <div class="col-md-3">
              <label class="form-label">End Date</label>
              <input v-model="form.end_date" type="date" class="form-control" required>
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label">Description</label>
            <textarea v-model.trim="form.description" class="form-control" rows="2" maxlength="1000"></textarea>
          </div>
          <div class="mb-3">
            <label class="form-label">Instructions for trekkers (used in reminders)</label>
            <textarea v-model.trim="form.instructions" class="form-control" rows="2" maxlength="1000"></textarea>
          </div>
          <div class="row mb-3">
            <div class="col-md-6" v-if="!editId">
              <label class="form-label">Assign Staff (optional)</label>
              <select v-model="form.staff_id" class="form-select">
                <option value="">-- No staff yet --</option>
                <option v-for="s in activeStaff" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>
            <div class="col-md-6" v-else>
              <label class="form-label">Status</label>
              <select v-model="form.status" class="form-select">
                <option v-for="s in statuses" :key="s">{{ s }}</option>
              </select>
            </div>
          </div>
          <button class="btn btn-success me-2">{{ editId ? 'Save Changes' : 'Create Trek' }}</button>
          <button type="button" class="btn btn-outline-secondary" @click="showForm = false">Cancel</button>
        </form>
      </div>
    </div>

    <div class="table-responsive">
      <table class="table table-striped align-middle bg-white shadow-sm">
        <thead class="table-dark">
          <tr>
            <th>Trek</th><th>Difficulty</th><th>Dates</th><th>Slots</th><th>Status</th>
            <th>Assigned Staff</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in treks" :key="t.id">
            <td><strong>{{ t.name }}</strong><br><small class="text-muted">{{ t.location }}</small></td>
            <td>{{ t.difficulty }}<br><small class="text-muted">{{ t.duration_days }} day(s)</small></td>
            <td><small>{{ t.start_date }}<br>to {{ t.end_date }}</small></td>
            <td>{{ t.available_slots }} / {{ t.total_slots }}</td>
            <td><span class="badge" :class="statusClass(t.status)">{{ t.status }}</span></td>
            <td>
              <select class="form-select form-select-sm" :value="t.staff_id || ''"
                      @change="assign(t, $event.target.value)">
                <option value="" disabled>-- Unassigned --</option>
                <option v-for="s in activeStaff" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </td>
            <td class="text-nowrap">
              <button class="btn btn-sm btn-outline-primary me-1" @click="openForm(t)">Edit</button>
              <button class="btn btn-sm btn-outline-danger" @click="remove(t)">Delete</button>
            </td>
          </tr>
          <tr v-if="!treks.length"><td colspan="7" class="text-center text-muted">No treks found.</td></tr>
        </tbody>
      </table>
    </div>`,
  computed: {
    activeStaff() {
      return this.staff.filter(s => s.is_active && !s.is_blacklisted);
    },
  },
  mounted() {
    this.load();
    this.loadStaff();
  },
  methods: {
    async load() {
      const data = await attempt(() => api('/api/admin/treks?q=' + encodeURIComponent(this.q)));
      if (data) this.treks = data.treks;
    },
    async loadStaff() {
      const data = await attempt(() => api('/api/admin/users?role=staff'));
      if (data) this.staff = data.users;
    },
    openForm(trek) {
      this.editId = trek ? trek.id : null;
      this.form = trek ? { ...blankTrekForm(), ...trek } : blankTrekForm();
      this.showForm = true;
    },
    async save() {
      const url = this.editId ? '/api/admin/treks/' + this.editId : '/api/admin/treks';
      const method = this.editId ? 'PUT' : 'POST';
      const data = await attempt(() => api(url, method, this.form), true);
      if (data) {
        this.showForm = false;
        this.load();
      }
    },
    async assign(trek, staffId) {
      await attempt(() => api(`/api/admin/treks/${trek.id}/assign`, 'PUT', { staff_id: staffId }), true);
      this.load();   // reload so the table shows the saved value again
    },
    async remove(trek) {
      if (!confirm(`Delete "${trek.name}"?`)) return;
      const data = await attempt(() => api('/api/admin/treks/' + trek.id, 'DELETE'), true);
      if (data) this.load();
    },
  },
};


// ---------------- Staff / Users: list, search, add staff, deactivate, blacklist ----------------

const AdminPeople = {
  props: ['role'],   // 'staff' or 'user'
  data() {
    return {
      people: [], q: '', showForm: false,
      form: { name: '', email: '', password: '', contact_details: '' },
    };
  },
  template: `
    <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
      <form class="d-flex" @submit.prevent="load">
        <input v-model="q" class="form-control me-2" placeholder="Search by name or email">
        <button class="btn btn-secondary">Search</button>
      </form>
      <button v-if="role === 'staff'" class="btn btn-primary" @click="showForm = !showForm">+ Add Staff</button>
    </div>

    <div v-if="showForm" class="card shadow mb-4">
      <div class="card-header bg-primary text-white">Add New Trek Staff</div>
      <div class="card-body">
        <form @submit.prevent="addStaff">
          <div class="row mb-3">
            <div class="col-md-6">
              <label class="form-label">Full Name</label>
              <input v-model.trim="form.name" class="form-control" required maxlength="100">
            </div>
            <div class="col-md-6">
              <label class="form-label">Email</label>
              <input v-model.trim="form.email" type="email" class="form-control" required>
            </div>
          </div>
          <div class="row mb-3">
            <div class="col-md-6">
              <label class="form-label">Temporary Password</label>
              <input v-model="form.password" type="password" class="form-control" required minlength="6">
            </div>
            <div class="col-md-6">
              <label class="form-label">Contact Number</label>
              <input v-model.trim="form.contact_details" class="form-control"
                     pattern="[0-9+]{7,15}" title="7 to 15 digits">
            </div>
          </div>
          <button class="btn btn-success">Add Staff</button>
        </form>
      </div>
    </div>

    <div class="table-responsive">
      <table class="table table-striped align-middle bg-white shadow-sm">
        <thead class="table-dark">
          <tr>
            <th>Name</th><th>Email</th><th>Contact</th>
            <th v-if="role === 'staff'">Assigned Treks</th>
            <th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in people" :key="p.id">
            <td>{{ p.name }}</td>
            <td>{{ p.email }}</td>
            <td>{{ p.contact_details || '-' }}</td>
            <td v-if="role === 'staff'">{{ p.assigned_treks.join(', ') || '-' }}</td>
            <td>
              <span class="badge me-1" :class="p.is_active ? 'bg-success' : 'bg-warning text-dark'">
                {{ p.is_active ? 'Active' : 'Deactivated' }}
              </span>
              <span v-if="p.is_blacklisted" class="badge bg-danger">Blacklisted</span>
            </td>
            <td class="text-nowrap">
              <button class="btn btn-sm btn-outline-warning me-1" @click="toggle(p, 'toggle_active')">
                {{ p.is_active ? 'Deactivate' : 'Activate' }}
              </button>
              <button class="btn btn-sm btn-outline-danger" @click="toggle(p, 'toggle_blacklist')">
                {{ p.is_blacklisted ? 'Unblacklist' : 'Blacklist' }}
              </button>
            </td>
          </tr>
          <tr v-if="!people.length"><td colspan="6" class="text-center text-muted">Nobody found.</td></tr>
        </tbody>
      </table>
    </div>`,
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      const url = `/api/admin/users?role=${this.role}&q=${encodeURIComponent(this.q)}`;
      const data = await attempt(() => api(url));
      if (data) this.people = data.users;
    },
    async addStaff() {
      const data = await attempt(() => api('/api/admin/staff', 'POST', this.form), true);
      if (data) {
        this.form = { name: '', email: '', password: '', contact_details: '' };
        this.showForm = false;
        this.load();
      }
    },
    async toggle(person, action) {
      const data = await attempt(() => api(`/api/admin/users/${person.id}/${action}`, 'POST'), true);
      if (data) this.load();
    },
  },
};


// ---------------- All bookings (complete trekking history) ----------------

const AdminBookings = {
  data() {
    return { bookings: [], q: '', status: '' };
  },
  template: `
    <form class="row g-2 mb-3" @submit.prevent="load">
      <div class="col-md-5">
        <input v-model="q" class="form-control" placeholder="Search by user or trek">
      </div>
      <div class="col-md-3">
        <select v-model="status" class="form-select">
          <option value="">All statuses</option>
          <option>Booked</option><option>Completed</option><option>Cancelled</option>
        </select>
      </div>
      <div class="col-md-2"><button class="btn btn-secondary w-100">Search</button></div>
    </form>

    <div class="table-responsive">
      <table class="table table-striped align-middle bg-white shadow-sm">
        <thead class="table-dark">
          <tr><th>#</th><th>Trekker</th><th>Trek</th><th>Trek Dates</th><th>Booked On</th><th>Status</th></tr>
        </thead>
        <tbody>
          <tr v-for="b in bookings" :key="b.id">
            <td>{{ b.id }}</td>
            <td>{{ b.user_name }}<br><small class="text-muted">{{ b.user_email }}</small></td>
            <td>{{ b.trek_name }}<br><small class="text-muted">{{ b.location }}</small></td>
            <td><small>{{ b.start_date }} to {{ b.end_date }}</small></td>
            <td><small>{{ b.booking_date }}</small></td>
            <td><span class="badge" :class="statusClass(b.status)">{{ b.status }}</span></td>
          </tr>
          <tr v-if="!bookings.length"><td colspan="6" class="text-center text-muted">No bookings found.</td></tr>
        </tbody>
      </table>
    </div>`,
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      const url = `/api/admin/bookings?q=${encodeURIComponent(this.q)}&status=${this.status}`;
      const data = await attempt(() => api(url));
      if (data) this.bookings = data.bookings;
    },
  },
};


// ---------------- Admin dashboard: tabs ----------------

const AdminDashboard = {
  components: { AdminOverview, AdminTreks, AdminPeople, AdminBookings },
  data() {
    return {
      tab: 'overview',
      tabs: [['overview', 'Overview'], ['treks', 'Treks'], ['staff', 'Staff'],
             ['users', 'Users'], ['bookings', 'All Bookings']],
    };
  },
  template: `
    <h2 class="text-primary">Admin Dashboard</h2>
    <p class="text-muted">Manage your trekking ecosystem.</p>

    <ul class="nav nav-tabs mb-4">
      <li class="nav-item" v-for="t in tabs" :key="t[0]">
        <a href="#" class="nav-link" :class="{ active: tab === t[0] }" @click.prevent="tab = t[0]">{{ t[1] }}</a>
      </li>
    </ul>

    <admin-overview v-if="tab === 'overview'"></admin-overview>
    <admin-treks v-else-if="tab === 'treks'"></admin-treks>
    <admin-people v-else-if="tab === 'staff'" role="staff" key="staff"></admin-people>
    <admin-people v-else-if="tab === 'users'" role="user" key="users"></admin-people>
    <admin-bookings v-else></admin-bookings>`,
};
