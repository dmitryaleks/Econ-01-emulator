import { App } from './ui/app.js';
import './style.css';

const root = document.getElementById('app');
const panel = document.getElementById('panel') as HTMLCanvasElement | null;
const scope = document.getElementById('scope') as HTMLCanvasElement | null;

if (root && panel && scope) {
  new App(root, panel, scope);
} else {
  document.body.textContent = 'Не удалось найти элементы страницы.';
}
