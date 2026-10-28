// Login and Register page (only trekkers can register; admin and staff just log in)

const AuthPage = {
  data() {
    return {
      mode: 'login',
      form: { name: '', email: '', password: '', contact_details: '' },
    };
  },
  template: `
    <div class="row justify-content-center">
      <div class="col-md-5">
        <div class="text-center mb-4">
          <h1 class="display-6 fw-bold">Welcome to TrekManager</h1>
          <p class="text-muted">Manage treks, meet expert guides and book your next adventure.</p>
        </div>
        <div class="card shadow">
          <div class="card-header bg-dark text-white">
            <h5 class="mb-0">{{ mode === 'login' ? 'Login' : 'Register as a Trekker' }}</h5>
          </div>
          <div class="card-body">
            <form @submit.prevent="submit">
              <div class="mb-3" v-if="mode === 'register'">
                <label class="form-label">Full Name</label>
                <input v-model.trim="form.name" class="form-control" required maxlength="100">
              </div>
              <div class="mb-3">
                <label class="form-label">Email</label>
                <input v-model.trim="form.email" type="email" class="form-control" required>
              </div>
              <div class="mb-3">
                <label class="form-label">Password</label>
                <input v-model="form.password" type="password" class="form-control" required
                       :minlength="mode === 'register' ? 6 : 1">
              </div>
              <div class="mb-3" v-if="mode === 'register'">
                <label class="form-label">Contact Number (optional)</label>
                <input v-model.trim="form.contact_details" class="form-control"
                       pattern="[0-9+]{7,15}" title="7 to 15 digits">
              </div>
              <button type="submit" class="btn btn-dark w-100">
                {{ mode === 'login' ? 'Login' : 'Register' }}
              </button>
            </form>
            <div class="text-center mt-3">
              <a href="#" @click.prevent="mode = mode === 'login' ? 'register' : 'login'">
                {{ mode === 'login' ? "New trekker? Create an account" : 'Already registered? Login' }}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>`,
  methods: {
    async submit() {
      if (this.mode === 'login') {
        const data = await attempt(() => api('/api/login', 'POST', this.form));
        if (data) store.user = data.user;
      } else {
        const data = await attempt(() => api('/api/register', 'POST', this.form), true);
        if (data) {
          this.mode = 'login';
          this.form.password = '';
        }
      }
    },
  },
};
