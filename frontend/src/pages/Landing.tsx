import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function Landing() {
  return (
    <div className="flex flex-col items-center text-center py-20">
      <motion.h1 initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:0.6}} className="text-4xl md:text-5xl font-bold">MindMatch Industrial</motion.h1>
      <motion.p initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.2}} className="mt-4 text-slate-300 max-w-xl">
        Hybrid AI retrieval + diversification + bandit exploration. Real posters, IMDb links, and where-to-watch info.
      </motion.p>
      <Link to="/quiz" className="mt-10 btn">Start Quiz</Link>
    </div>
  )
}
