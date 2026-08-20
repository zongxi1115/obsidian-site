import { pinyin } from 'pinyin-pro';
import tagsJson from '@/content/tags.json';

export interface TagEntry {
  title: string;
  url: string;
}

export const allTags = tagsJson as Record<string, TagEntry[]>;

/**
 * 标签也要进 URL，跟笔记文件名一个道理：中文得转拼音，
 * 不然 Next 的客户端路由匹配不上百分号编码的路径段。
 */
export function tagSlug(tag: string) {
  const slug = pinyin(tag, { toneType: 'none', type: 'array', nonZh: 'consecutive' })
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'tag';
}

/** slug → 原始标签名。同音撞车的话按出现顺序取第一个 */
export function tagFromSlug(slug: string) {
  return Object.keys(allTags).find((tag) => tagSlug(tag) === slug);
}

export const tagList = Object.entries(allTags)
  .map(([tag, notes]) => ({ tag, slug: tagSlug(tag), count: notes.length }))
  .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh'));
