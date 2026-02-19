import { Outlet } from 'react-router-dom';
import StudentSidebar from '../../components/student/StudentSidebar';

function StudentLayout() {
  return (
    <div className="flex min-h-screen bg-[#f3f7fc]">
      <StudentSidebar />
      <main className="flex-1 overflow-auto p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}

export default StudentLayout;
