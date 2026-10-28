// Staff dashboard: assigned treks, slots/status, start/complete, participant list

const StaffDashboard = {
  data() {
    return { treks: [] };
  },
  template: `
    <h2 class="text-warning">Staff Dashboard</h2>
    <p class="text-muted">Manage your assigned treks and view your participants.</p>

    <div v-if="!treks.length" class="alert alert-info">
      You have not been assigned to any treks yet. Please wait for the admin to assign you.
    </div>

    <div class="card shadow mb-4 border-warning" v-for="t in treks" :key="t.id">
      <div class="card-header bg-dark text-white d-flex flex-wrap justify-content-between gap-2">
        <span>{{ t.name }} ({{ t.location }})</span>
        <span>
          <span class="badge" :class="statusClass(t.status)">{{ t.status }}</span>
          <span v-if="t.is_started && t.status !== 'Completed'" class="badge bg-warning text-dark ms-1">Started</span>
        </span>
      </div>

      <div class="card-body">
        <div class="row">
          <div class="col-md-5 border-end mb-3">
            <p class="mb-1"><small class="text-muted">
              {{ t.start_date }} to {{ t.end_date }} &middot; {{ t.difficulty }} &middot; {{ t.duration_days }} day(s)
            </small></p>
            <p class="fs-5 mb-3"><span class="badge bg-primary">{{ t.registered_count }}</span> registered user(s)</p>

            <form v-if="!t.is_started && t.status !== 'Completed'" @submit.prevent="update(t)">
              <div class="mb-2">
                <label class="form-label">Available slots (total {{ t.total_slots }})</label>
                <input v-model.number="t.new_slots" type="number" min="0" :max="t.total_slots"
                       class="form-control" required>
              </div>
              <div class="mb-3">
                <label class="form-label">Trek status</label>
                <select v-model="t.new_status" class="form-select">
                  <option value="">(keep {{ t.status }})</option>
                  <option value="Open">Open for booking</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
              <button class="btn btn-warning w-100 mb-2">Update Trek</button>
            </form>

            <button v-if="!t.is_started && t.status !== 'Completed' && t.status !== 'Pending'"
                    class="btn btn-outline-dark w-100 mb-2" @click="start(t)">Mark as Started</button>
            <button v-if="t.is_started && t.status !== 'Completed'"
                    class="btn btn-success w-100 mb-2" @click="complete(t)">Mark as Completed</button>
          </div>

          <div class="col-md-7">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="mb-0">Participants</h6>
              <button class="btn btn-sm btn-outline-secondary" @click="toggleParticipants(t)">
                {{ t.participants ? 'Hide' : 'Show' }} list
              </button>
            </div>
            <div v-if="t.participants" class="table-responsive">
              <table class="table table-sm table-striped">
                <thead><tr><th>Name</th><th>Email</th><th>Contact</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  <tr v-for="b in t.participants" :key="b.id">
                    <td>{{ b.user_name }}</td>
                    <td>{{ b.user_email }}</td>
                    <td>{{ b.user_contact || '-' }}</td>
                    <td><span class="badge" :class="statusClass(b.status)">{{ b.status }}</span></td>
                    <td>
                      <button v-if="b.status === 'Booked' && !t.is_started"
                              class="btn btn-sm btn-outline-danger" @click="removeParticipant(t, b)">Remove</button>
                    </td>
                  </tr>
                  <tr v-if="!t.participants.length">
                    <td colspan="5" class="text-muted">No one has booked this trek yet.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>`,
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      const data = await attempt(() => api('/api/staff/treks'));
      if (data) {
        // extra fields used only by this page: form values and the participant list
        this.treks = data.treks.map(t => ({ ...t, new_slots: t.available_slots, new_status: '', participants: null }));
      }
    },
    async update(trek) {
      const body = { available_slots: trek.new_slots, status: trek.new_status };
      const data = await attempt(() => api('/api/staff/treks/' + trek.id, 'PUT', body), true);
      if (data) this.load();
    },
    async start(trek) {
      if (!confirm(`Mark "${trek.name}" as started? Bookings will close.`)) return;
      const data = await attempt(() => api(`/api/staff/treks/${trek.id}/start`, 'POST'), true);
      if (data) this.load();
    },
    async complete(trek) {
      if (!confirm(`Mark "${trek.name}" as completed?`)) return;
      const data = await attempt(() => api(`/api/staff/treks/${trek.id}/complete`, 'POST'), true);
      if (data) this.load();
    },
    async toggleParticipants(trek) {
      if (trek.participants) {
        trek.participants = null;
        return;
      }
      const data = await attempt(() => api(`/api/staff/treks/${trek.id}/participants`));
      if (data) trek.participants = data.participants;
    },
    async removeParticipant(trek, booking) {
      if (!confirm(`Remove ${booking.user_name} from this trek?`)) return;
      const data = await attempt(() => api(`/api/staff/bookings/${booking.id}/cancel`, 'POST'), true);
      if (data) {
        await this.load();
        const fresh = this.treks.find(t => t.id === trek.id);
        if (fresh) this.toggleParticipants(fresh);   // reopen the list with updated data
      }
    },
  },
};
