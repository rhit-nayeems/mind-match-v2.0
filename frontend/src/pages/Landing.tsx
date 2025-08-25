import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function Landing() {
  return (
    <div className="flex flex-col items-center text-center py-20">
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-4xl md:text-5xl font-bold"
      >
        MindMatch — Find tonight’s movie in 60 seconds
      </motion.h1>

      <motion.h2
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="mt-3 text-lg md:text-xl text-slate-200"
      >
        Stop scrolling. Start watching.
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-4 text-slate-300 max-w-xl"
      >
        Discover movies that match your mood and personality. Answer a few quick questions and get
        films our AI-powered tool selects to feel like they were made just for you.
      </motion.p>

      <Link to="/quiz" className="mt-10 btn">Start Quiz</Link>
    </div>
  )
}
