/**
 * Agendit - Lógica Principal (app.js)
 * Gerenciamento de Estado no localStorage, Checkout, Dashboard e Agendamento
 */

const STORAGE_KEYS = {
  USER: 'agendafacil_user',
  BUSINESS: 'agendafacil_business',
  SERVICES: 'agendafacil_services',
  APPOINTMENTS: 'agendafacil_appointments',
  USERS: 'agendafacil_users',
  SESSION: 'agendafacil_session'
};

// --- Autenticação de empresários ---
function hashPassword(password) {
  let hash = 0;
  const str = (password || '') + 'agendafacil-salt';
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36) + ':' + str.length;
}

const Auth = {
  getUsers() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USERS);
      const list = data ? JSON.parse(data) : [];
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  },
  saveUsers(list) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(list));
  },
  getSession() {
    try {
      const s = localStorage.getItem(STORAGE_KEYS.SESSION);
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  },
  isLoggedIn() {
    return !!this.getSession();
  },
  // Identifica se o usuário da sessão atual é administrador
  isAdmin() {
    const u = this.currentUser;
    return !!(u && u.role === 'admin');
  },
  get currentUser() {
    const s = this.getSession();
    if (!s) return null;
    const users = this.getUsers();
    return users.find(u => u.email === s.email) || null;
  },
  // Login exclusivo do administrador (valida e exige role admin)
  loginAdmin(email, password) {
    email = (email || '').trim().toLowerCase();
    const users = this.getUsers();
    const user = users.find(u => u.email === email && u.role === 'admin');
    if (!user || user.passwordHash !== hashPassword(password)) {
      return { ok: false, error: 'Credenciais de administrador inválidas.' };
    }
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify({ email: user.email }));
    return { ok: true, user };
  },
  register(name, email, password) {
    email = (email || '').trim().toLowerCase();
    const users = this.getUsers();
    if (users.some(u => u.email === email)) return { ok: false, error: 'Este e-mail já está cadastrado.' };
    const user = {
      id: 'user-' + Date.now(),
      name: (name || '').trim(),
      email,
      role: 'business',            // 'business' | 'admin'
      passwordHash: hashPassword(password)
    };
    users.push(user);
    this.saveUsers(users);
    return { ok: true, user };
  },
  // Cria a conta de Administrador padrão se ainda não existir
  ensureAdmin() {
    const users = this.getUsers();
    if (users.some(u => u.role === 'admin')) return;
    const admin = {
      id: 'admin-root',
      name: 'Administrador',
      email: 'admin@kemilesalomao017.com',
      role: 'admin',
      passwordHash: hashPassword('@Ks250805')
    };
    users.push(admin);
    this.saveUsers(users);
  },
  login(email, password) {
    email = (email || '').trim().toLowerCase();
    const users = this.getUsers();
    const user = users.find(u => u.email === email);
    if (!user || user.passwordHash !== hashPassword(password)) {
      return { ok: false, error: 'E-mail ou senha incorretos.' };
    }
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify({ email: user.email }));
    return { ok: true, user };
  },
  logout() {
    localStorage.removeItem(STORAGE_KEYS.SESSION);
  }
};

// Dados padrão iniciais caso não existam
const DEFAULT_BUSINESS = {
  slug: 'studio-vip',
  name: 'Studio VIP Beauty & Barber',
  segment: 'barbearia',
  whatsapp: '5511999999999',
  address: 'Rua das Flores, 123 - Centro',
  hours: 'Seg a Sáb: 09:00 às 19:00',
  description: 'Especialistas em cortes masculinos, design de barba e estética.',
  logo: '', // Base64 ou URL
  primaryColor: '#7C3AED',
  pixKey: '',
  pixName: '',
  pixQr: '', // Base64 ou URL do QR Code PIX enviado pelo empresário
  pixQrEnabled: false, // se o empresário quer exibir o QR no chat
  // Configuração de pagamento
  paymentConfig: {
    requireUpfront: false,   // true = exige pagamento antecipado
    upfrontPercent: null,    // 25 | 50 | 100 (percentual do sinal)
    gateway: 'none'          // 'none' | 'mercadopago' | 'pagbank' | 'asaas' | custom
  }
};

// Percentuais de sinal disponíveis (preparado para adicionar novos no futuro)
const UPFRONT_PERCENT_OPTIONS = [25, 50, 100];

// Regras de banco: status possíveis de uma transação/pagamento
const PAYMENT_STATUS = {
  PENDING: 'pending',        // Pendente — aguardando confirmação
  PAID: 'paid',              // Pago — sinal/recebido
  PARTIAL: 'partial',        // Pagamento parcial — parte paga, resta presencial
  CANCELLED: 'cancelled',    // Cancelado
  REFUNDED: 'refunded'       // Reembolsado
};

// Regras de banco: status possíveis do agendamento
const APPOINTMENT_STATUS = {
  BOOKED: 'booked',          // Agendado/confirmado
  PENDING_PAYMENT: 'pending_payment', // Aguardando pagamento
  CANCELLED: 'cancelled',
  COMPLETED: 'completed'
};

const DEFAULT_SERVICES = [
  { id: '1', name: 'Corte Tradicional / Degradê', duration: '40 min', price: 45.00, icon: '✂️' },
  { id: '2', name: 'Barba Terapia Completa', duration: '35 min', price: 35.00, icon: '🧔' },
  { id: '3', name: 'Combo Corte + Barba', duration: '1h 15 min', price: 70.00, icon: '💈' },
  { id: '4', name: 'Design de Sobrancelhas / Cílios', duration: '45 min', price: 50.00, icon: '👁️' },
  { id: '5', name: 'Bronze de Fita Completo', duration: '1h 30 min', price: 90.00, icon: '☀️' }
];

// Utilitários de Storage
const Storage = {
  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.USER)) || null;
    } catch { return null; }
  },
  setUser: (user) => {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  },
  getBusiness: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BUSINESS);
      return data ? JSON.parse(data) : DEFAULT_BUSINESS;
    } catch { return DEFAULT_BUSINESS; }
  },
  setBusiness: (business) => {
    localStorage.setItem(STORAGE_KEYS.BUSINESS, JSON.stringify(business));
  },
  getServices: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SERVICES);
      return data ? JSON.parse(data) : DEFAULT_SERVICES;
    } catch { return DEFAULT_SERVICES; }
  },
  setServices: (services) => {
    localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(services));
  },
  getAppointments: () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.APPOINTMENTS)) || [
        {
          id: 'apt-101',
          clientName: 'Lucas Ferreira',
          clientPhone: '11988887777',
          serviceName: 'Combo Corte + Barba',
          date: '2026-09-04',
          time: '14:00',
          price: 70.00,
          status: 'confirmed'
        },
        {
          id: 'apt-102',
          clientName: 'Camila Rocha',
          clientPhone: '11977776666',
          serviceName: 'Design de Sobrancelhas / Cílios',
          date: '2026-09-04',
          time: '15:30',
          price: 50.00,
          status: 'pending'
        }
      ];
    } catch { return []; }
  },
  addAppointment: (apt) => {
    const list = Storage.getAppointments();
    list.unshift(apt);
    localStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(list));
  },
  updateAppointmentStatus: (id, status) => {
    const list = Storage.getAppointments();
    const idx = list.findIndex(item => item.id === id);
    if (idx !== -1) {
      list[idx].status = status;
      localStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(list));
    }
  },
  updateAppointment: (id, patch) => {
    const list = Storage.getAppointments();
    const idx = list.findIndex(item => item.id === id);
    if (idx !== -1) {
      list[idx] = Object.assign({}, list[idx], patch);
      localStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(list));
      return list[idx];
    }
    return null;
  },
  getPaymentConfig() {
    const biz = Storage.getBusiness();
    return (biz && biz.paymentConfig) ? biz.paymentConfig : { requireUpfront: false, upfrontPercent: null, gateway: 'none' };
  },
  setPaymentConfig(config) {
    const biz = Storage.getBusiness();
    biz.paymentConfig = Object.assign({ requireUpfront: false, upfrontPercent: null, gateway: 'none' }, config);
    Storage.setBusiness(biz);
  }
};

/* =========================================================
   MÓDULO DE PAGAMENTO
   Estrutura preparada para conectar um gateway de pagamento
   (Mercado Pago, PagBank, Asaas, etc.) via API.

   IMPORTANTE: Nenhum dado de cartão de crédito é armazenado
   localmente. A cobrança é criada no gateway (backend) e aqui
   apenas registramos o RESULTADO da transação (status, valor,
   método) no agendamento, nunca os dados do cartão.
   ========================================================= */

// Calcula os valores de pagamento de um serviço conforme a config do empresário
function computePayment(servicePrice, paymentConfig) {
  const total = Number(servicePrice) || 0;

  if (!paymentConfig || !paymentConfig.requireUpfront) {
    // Opção A — agendamento gratuito (pagamento presencial)
    return {
      requiresUpfront: false,
      total,
      upfrontAmount: 0,
      remainingAmount: total,
      percent: null
    };
  }

  // Opção B — pagamento antecipado (sinal)
  const percent = Number(paymentConfig.upfrontPercent);
  const safePercent = UPFRONT_PERCENT_OPTIONS.indexOf(percent) !== -1 ? percent : 100;
  const upfrontAmount = roundMoney(total * safePercent / 100);
  const remainingAmount = roundMoney(total - upfrontAmount);

  return {
    requiresUpfront: true,
    total,
    upfrontAmount,
    remainingAmount,
    percent: safePercent
  };
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

// Mapa de métodos de pagamento aceitos online (PIX e cartão apenas)
const PAYMENT_METHODS = {
  PIX: 'pix',
  CARD: 'card'
};

/* ------------------- GATEWAY (STUB) ----------------------
   Este objeto é o PONTO ÚNICO de integração. Para conectar um
   gateway real, substitua as funções internas por chamadas à
   sua API (fetch) usando as credenciais do gateway no backend.

   NUNCA coloque secret/credenciais no front-end em produção.
   O fluxo correto é: front-end -> sua API -> gateway.
-------------------------------------------------------------*/
const PaymentGateway = {
  // Configuração ativa do gateway (setada pelo painel)
  activeGateway: 'none',

  /**
   * Cria uma cobrança no gateway.
   * @returns {Promise<{ok, paymentId, status, message, qrCode?, copyPaste?>}
   *   - Com gateway conectado: retorna dados de pagamento do gateway.
   *   - Modo demonstração ('none'): simula o processamento.
   */
  createCharge({ amount, method, description, biz, customer }) {
    if (this.activeGateway === 'mercadopago') {
      // FUTURO: chamar sua API, ex: POST /api/payments/mp/create
      // return apiCreateMPCharge({ amount, method, ... });
      return this.fallback(amount, method, description, biz, customer);
    }
    if (this.activeGateway === 'pagbank') {
      // FUTURO: POST /api/payments/pagbank/create
      return this.fallback(amount, method, description, biz, customer);
    }
    if (this.activeGateway === 'asaas') {
      // FUTURO: POST /api/payments/asaas/create
      return this.fallback(amount, method, description, biz, customer);
    }
    // Modo demonstração (sem gateway conectado)
    return this.demoCreateCharge(amount, method, description, biz, customer);
  },

  /**
   * Confirma/consulta o status do pagamento.
   * Com gateway, chame sua API para verificar o payload de webhook.
   */
  confirmCharge(paymentId) {
    if (this.activeGateway === 'none') {
      return this.demoConfirm(paymentId);
    }
    // FUTURO: consultar status real na sua API
    return this.demoConfirm(paymentId);
  },

  // --- Simulação (modo demonstração) ---
  demoCreateCharge(amount, method, description, biz, customer) {
    let paymentId = 'pay-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const res = {
      ok: true,
      paymentId,
      status: method === PAYMENT_METHODS.PIX ? 'pending' : 'approved',
      message: method === PAYMENT_METHODS.PIX
        ? 'Pagamento PIX criado. Utilize a chave abaixo para pagar.'
        : '',
      amount,
      method
    };

    // No PIX disponibilizamos a chave da empresa (demonstração)
    if (method === PAYMENT_METHODS.PIX) {
      res.pixKey = (biz && biz.pixKey) || '';
      res.pixName = (biz && biz.pixName) || '';
    }
    // Cartão: em um fluxo real, tokenizar no gateway. Aqui só simulamos.
    return new Promise(resolve => setTimeout(() => resolve(res), 900));
  },

  demoConfirm(paymentId) {
    return new Promise(resolve => {
      setTimeout(() => resolve({ ok: true, paymentId, status: 'approved' }), 1100);
    });
  },

  // Fallback quando não há gateway configurado mas está apontado
  fallback(amount, method, description, biz, customer) {
    return this.demoCreateCharge(amount, method, description, biz, customer);
  },

  setActiveGateway(name) {
    this.activeGateway = ['mercadopago', 'pagbank', 'asaas'].indexOf(name) !== -1 ? name : 'none';
  }
};

// Handle genérico para montar o objeto de pagamento de um agendamento
function buildPaymentRecord({ servicePrice, paymentConfig, method }) {
  const calc = computePayment(servicePrice, paymentConfig);
  return {
    requireUpfront: calc.requiresUpfront,
    total: calc.total,
    upfrontPercent: calc.percent,
    upfrontAmount: calc.upfrontAmount,
    remainingAmount: calc.remainingAmount,
    method: method || null,
    paidAmount: 0,
    // status do pagamento: pending | paid | partial | cancelled | refunded
    paymentStatus: calc.requiresUpfront ? PAYMENT_STATUS.PENDING : PAYMENT_STATUS.PAID,
    // status do agendamento: booked | pending_payment | cancelled | completed
    appointmentStatus: calc.requiresUpfront ? APPOINTMENT_STATUS.PENDING_PAYMENT : APPOINTMENT_STATUS.BOOKED
  };
}

// Função para marcar o pagamento como realizado (chamada após aprovação)
function markAppointmentPaid(apt, method) {
  const calc = computePayment(apt.price, Storage.getPaymentConfig());
  const isFull = calc.remainingAmount <= 0;
  const paymentStatus = isFull ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PARTIAL;
  return Storage.updateAppointment(apt.id, {
    paymentStatus,
    appointmentStatus: APPOINTMENT_STATUS.BOOKED,
    paidAmount: calc.upfrontAmount,
    method: method || apt.method
  });
}

// Exibir Notificação Toast
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Máscaras e Formatações
function maskPhone(value) {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{4})$/, '$1-$2')
    .substring(0, 15);
}

function maskCardNumber(value) {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{4})(?=\d)/g, '$1 ')
    .substring(0, 19);
}

function maskCardExpiry(value) {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1/$2')
    .substring(0, 5);
}

// Formatar Moeda Real (BRL)
function formatMoney(value) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Inicializar dados padrão se vazios
(function initStorage() {
  if (!localStorage.getItem(STORAGE_KEYS.BUSINESS)) {
    Storage.setBusiness(DEFAULT_BUSINESS);
  }
  if (!localStorage.getItem(STORAGE_KEYS.SERVICES)) {
    Storage.setServices(DEFAULT_SERVICES);
  }
  // Garante a conta de Administrador padrão na primeira execução
  Auth.ensureAdmin();
})();

// Controle do Menu Mobile (Navbar)
function toggleNavMenu() {
  const nav = document.getElementById('mobile-nav');
  const toggle = document.getElementById('nav-toggle');
  if (nav) {
    nav.classList.toggle('open');
    if (toggle) toggle.innerText = nav.classList.contains('open') ? '✕' : '☰';
  }
}

function closeNavMenu() {
  const nav = document.getElementById('mobile-nav');
  const toggle = document.getElementById('nav-toggle');
  if (nav) {
    nav.classList.remove('open');
    if (toggle) toggle.innerText = '☰';
  }
}
