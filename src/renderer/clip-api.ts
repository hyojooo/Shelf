import type { ClipApi } from '../preload/index';
import { DEFAULT_SETTINGS, type Clip } from '../shared/types';

const imgPlaceholder =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="100%" height="100%" fill="#7c5cff"/><text x="50%" y="50%" fill="#fff" font-size="18" text-anchor="middle" dominant-baseline="middle">Mock Image</text></svg>',
  );

const now = Date.now();
const mockClips: Clip[] = [
  {
    id: 'm1',
    type: 'text',
    text: 'Shelf 是一款跨平台剪切板管理工具，支持文本与图片捕获、去重、搜索。',
    hash: 'h1',
    createdAt: now - 1000 * 60 * 30,
    updatedAt: now - 1000 * 60 * 30,
    size: 88,
    favorite: true,
  },
  {
    id: 'm2',
    type: 'text',
    text: 'const x = await window.clip.getAll()',
    hash: 'h2',
    createdAt: now - 1000 * 60 * 20,
    updatedAt: now - 1000 * 60 * 20,
    size: 36,
    favorite: false,
  },
  {
    id: 'm3',
    type: 'image',
    hash: 'h3',
    format: 'jpeg',
    width: 240,
    height: 160,
    thumb: imgPlaceholder,
    size: 12400,
    createdAt: now - 1000 * 60 * 15,
    updatedAt: now - 1000 * 60 * 15,
    favorite: false,
  },
  {
    id: 'm4',
    type: 'text',
    text: 'https://registry.npmmirror.com 是国内加速镜像，可解决 npm 卡死问题。',
    hash: 'h4',
    createdAt: now - 1000 * 60 * 10,
    updatedAt: now - 1000 * 60 * 10,
    size: 60,
    favorite: false,
  },
  {
    id: 'm5',
    type: 'text',
    text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. 用于测试虚拟滚动渲染。',
    hash: 'h5',
    createdAt: now - 1000 * 60 * 5,
    updatedAt: now - 1000 * 60 * 5,
    size: 72,
    favorite: false,
  },
] as Clip[];

const noopApi: ClipApi = {
  getAll: () => Promise.resolve(mockClips),
  favorite: () => Promise.resolve(false),
  deleteClip: () => Promise.resolve(false),
  clearAll: () => Promise.resolve(false),
  copy: () => Promise.resolve(false),
  paste: () => Promise.resolve(false),
  getSettings: () => Promise.resolve(DEFAULT_SETTINGS),
  updateSettings: () => Promise.resolve(DEFAULT_SETTINGS),
  checkUpdate: () => Promise.resolve(null),
  installUpdate: () => {},
  quit: () => Promise.resolve(false),
  getVersion: () => Promise.resolve('1.0.0'),
  getImageUrl: () => Promise.resolve(imgPlaceholder),
  on: () => () => {},
};

export function getClip(): ClipApi {
  return (typeof window !== 'undefined' && (window as any).clip) || noopApi;
}
