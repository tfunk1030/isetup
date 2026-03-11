"""Physics-based setup solver for iRacing GTP/Hypercar cars.

6-step constraint satisfaction workflow:
1. Rake/Ride Heights — target DF balance, maximize L/D
2. Heave/Third Springs — minimize bottoming, platform stability
3. Corner Springs — balance grip vs platform (not yet implemented)
4. ARBs — target LLTD (not yet implemented)
5. Wheel Geometry — optimize contact patch (not yet implemented)
6. Dampers — transient response (not yet implemented)
"""

from solver.rake_solver import RakeSolver, RakeSolution
from solver.heave_solver import HeaveSolver, HeaveSolution
