import { useState } from 'react';
import { motion } from 'framer-motion';
import { Github, Code, Terminal, Cpu } from 'lucide-react';

export function DeveloperCredit() {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <motion.div
            className="fixed bottom-6 left-6 z-50 hidden md:flex items-end"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1, type: "spring" }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <a
                href="https://github.com/grknsytrk/f1-driver-rater"
                target="_blank"
                rel="noopener noreferrer"
                className="relative group"
            >
                {/* Connecting Line Decoration */}
                <div className="absolute bottom-6 left-full w-8 h-[1px] bg-gradient-to-r from-[var(--accent-red)] to-transparent opacity-0 group-hover:opacity-50 transition-opacity duration-500" />

                <div className={`
                    flex items-center gap-0 overflow-hidden bg-[var(--bg-panel)] border border-[var(--border-color)] 
                    hover:border-[var(--accent-red)] transition-all duration-300 shadow-2xl
                    ${isHovered ? 'pr-6' : 'pr-0'}
                `}
                    style={{
                        clipPath: 'polygon(0 0, 100% 0, 100% 85%, 90% 100%, 0 100%)' // Cyberpunk/F1 corner cut
                    }}
                >
                    {/* Icon Section (Always Visible) */}
                    <div className="relative p-3 bg-[var(--bg-darker)] border-r border-[var(--border-color)] group-hover:border-[var(--accent-red)] transition-colors">
                        <Github size={24} className="text-white group-hover:text-[var(--accent-red)] transition-colors" />

                        {/* Status Light */}
                        <div className="absolute top-2 right-2 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff00] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00ff00]"></span>
                        </div>
                    </div>

                    {/* Content Section (Revealed on Hover) */}
                    <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{
                            width: isHovered ? 'auto' : 0,
                            opacity: isHovered ? 1 : 0
                        }}
                        className="flex flex-col whitespace-nowrap overflow-hidden"
                    >
                        <div className="px-4 py-2">


                            <div className="flex items-center justify-between gap-4">
                                <span className="font-display text-xl text-white uppercase tracking-wider leading-none">
                                    GRKNSYTRK
                                </span>
                                <Code size={14} className="text-[var(--text-muted)]" />
                            </div>

                            <div className="flex gap-3 mt-2 opacity-50">
                                <span className="font-mono text-[9px] text-[var(--text-muted)] flex items-center gap-1">
                                    <Terminal size={10} /> REC
                                </span>
                                <span className="font-mono text-[9px] text-[var(--text-muted)] flex items-center gap-1">
                                    <Cpu size={10} /> 99%
                                </span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </a>
        </motion.div>
    );
}
