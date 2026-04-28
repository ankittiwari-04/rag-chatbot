'use client';

import { motion } from 'framer-motion';

export default function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 mb-4">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold mt-1">
        AI
      </div>

      {/* Bubble */}
      <div
        className="px-4 py-3 rounded-2xl rounded-tl-sm"
        style={{
          background: '#1a1a1a',
          border: '1px solid #1f1f1f',
          minWidth: '64px',
        }}
      >
        <div className="flex items-center gap-1.5 py-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="block w-2 h-2 rounded-full"
              style={{ background: '#6366f1' }}
              animate={{ scale: [0.5, 1, 0.5], opacity: [0.4, 1, 0.4] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.2,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
