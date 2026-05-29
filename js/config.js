// config.js - 象限配置常量

const QUADRANTS = {
  I: {
    id: 'I',
    name: '重要紧急',
    label: '立即处理',
    colorStart: '#ffb3b3',
    colorEnd: '#ffc2c2',
    icon: '🔥'
  },
  II: {
    id: 'II',
    name: '重要不紧急',
    label: '计划安排',
    colorStart: '#b3d4ff',
    colorEnd: '#cce0ff',
    icon: '📋'
  },
  III: {
    id: 'III',
    name: '不重要紧急',
    label: '委派处理',
    colorStart: '#fff5b3',
    colorEnd: '#fff9cc',
    icon: '⚡'
  },
  IV: {
    id: 'IV',
    name: '不重要不紧急',
    label: '尽量减少',
    colorStart: '#c3f0c3',
    colorEnd: '#d9f5d9',
    icon: '🌿'
  }
};

const QUADRANT_KEYS = ['I', 'II', 'III', 'IV'];

const COMPLETION_OPTIONS = [
  '<50%',
  '55%', '60%', '65%', '70%', '75%',
  '80%', '85%', '90%', '95%', '100%'
];

const TIME_SLOTS = [
  { key: '',           icon: '⬚', label: '无时段要求', title: '无时段要求' },
  { key: 'early_morn', icon: '🌄', label: '早晨',      title: '早晨 (~5-8点)' },
  { key: 'forenoon',   icon: '🕘', label: '上午',      title: '上午 (~8-12点)' },
  { key: 'noon',       icon: '☀️', label: '中午',      title: '中午 (~12-13点)' },
  { key: 'afternoon',  icon: '🕒', label: '下午',      title: '下午 (~13-17点)' },
  { key: 'dusk',       icon: '🌇', label: '傍晚',      title: '傍晚 (~17-19点)' },
  { key: 'night',      icon: '🌙', label: '晚上',      title: '晚上 (~19点后)' }
];
