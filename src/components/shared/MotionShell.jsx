import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion';
import { Outlet } from 'react-router-dom';

// Features are the small domAnimation set (animate, exit, hover, tap), loaded
// with this layout route — not with /login. `m` components throw in strict
// mode if they render outside this shell, which keeps the full motion runtime
// out of the graph.
export default function MotionShell() {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <Outlet />
      </MotionConfig>
    </LazyMotion>
  );
}
