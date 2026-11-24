import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface Props<T> {
  items: T[];
  rowHeight: number;
  overscan?: number;
  renderRow: (item: T, index: number) => ReactNode;
  className?: string;
}

export default function VirtualList<T>({
  items,
  rowHeight,
  overscan = 6,
  renderRow,
  className,
}: Props<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setViewportH(el.clientHeight);
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 列表收缩（切标签 / 搜索 / 删除）后，旧的 scrollTop 会超出内容高度，
  // 导致 start > end 而渲染出空列表 —— 必须把滚动位置夹回有效范围。
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const maxTop = Math.max(0, items.length * rowHeight - el.clientHeight);
    if (el.scrollTop > maxTop) {
      el.scrollTop = maxTop;
      setScrollTop(maxTop);
    }
  }, [items.length, rowHeight]);

  const total = items.length * rowHeight;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(
    items.length,
    Math.ceil((scrollTop + (viewportH || 600)) / rowHeight) + overscan,
  );
  const visible = items.slice(start, end);

  return (
    <div
      className={'vlist' + (className ? ' ' + className : '')}
      ref={ref}
      onScroll={(e) => {
        setScrollTop((e.currentTarget as HTMLDivElement).scrollTop);
        if (!viewportH && ref.current) setViewportH(ref.current.clientHeight);
      }}
    >
      <div style={{ height: total, position: 'relative' }}>
        <div style={{ transform: `translateY(${start * rowHeight}px)` }}>
          {visible.map((it, i) => (
            <div
              key={(it as { id?: string }).id ?? start + i}
              style={{ height: rowHeight }}
            >
              {renderRow(it, start + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
