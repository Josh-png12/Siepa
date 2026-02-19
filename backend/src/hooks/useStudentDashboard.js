import { useQuery } from '@tanstack/react-query';
import { getStudentDashboard } from '../services/studentService';

export const useStudentDashboard = () => {
  return useQuery({
    queryKey: ['studentDashboard'],
    queryFn: getStudentDashboard,
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
};