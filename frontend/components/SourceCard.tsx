'use client';

import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import type { Source } from '@/types';

interface SourceCardProps {
  source: Source;
  index: number;
}

function getScoreColor(score: number): { bar: string; text: string } {
  if (score >= 0.8) return { bar: '#22c55e', text: '#86efac' };
  if (score >= 0.5) return { bar: '#f59e0b', text: '#fcd34d' };
  return { bar: '#ef4444', text: '#fca5a5' };
}

export default function SourceCard({ source, index }: SourceCardProps) {
  const { bar, text } = getScoreColor(source.score);
  const scorePercent = Math.round(source.score * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      whileHover={{ y: -2, borderColor: '#2a2a2a' }}
      className="group rounded-xl p-3 cursor-default transition-all"
      style={{
        background: '#0f0f0f',
        border: '1px solid #1f1f1f',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(99,102,241,0.12)' }}
        >
          <FileText size={12} color="#6366f1" />
        </div>
        <span
          className="text-xs font-medium truncate flex-1"
          style={{ color: '#f5f5f5' }}
          title={source.file}
        >
          {source.file}
        </span>

        {/* Score badge */}
        <span
          className="text-xs font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0"
          style={{ color: text, background: `${bar}15` }}
        >
          {scorePercent}%
        </span>
      </div>

      {/* Score bar */}
      <div
        className="h-1 rounded-full mb-2 overflow-hidden"
        style={{ background: '#1f1f1f' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: bar }}
          initial={{ width: 0 }}
          animate={{ width: `${scorePercent}%` }}
          transition={{ duration: 0.6, delay: index * 0.06 + 0.2, ease: 'easeOut' }}
        />
      </div>

      {/* Excerpt */}
      <p
        className="text-xs leading-relaxed line-clamp-3"
        style={{ color: '#a3a3a3' }}
      >
        {source.excerpt}
      </p>
    </motion.div>
  );
}
