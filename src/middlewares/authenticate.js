  import jwt from 'jsonwebtoken';

  export function authenticateToken(req, res, next) {
    try {
      const token = req.header('Authorization')?.split(' ')[1];

      if (!token) return res.status(401).json({ message: 'Unauthorized' });
      jwt.verify(token, process.env.JWT_SECRET, (err, userData) => {
        if (err) return res.status(403).json({ message: 'Forbidden' });

        req.user = userData; // Attach user data to request object
        next();
      });
    } catch (error) {
      next(error);
    }
  }
