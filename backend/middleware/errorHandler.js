export const notFound = (req, res) => {
  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
    }
  });
};

export const errorHandler = (error, req, res, next) => {
  console.error(JSON.stringify({
    level: 'error',
    event: 'request_error',
    method: req.method,
    path: req.originalUrl.split('?')[0],
    status: error.statusCode || error.status || 500,
    name: error.name,
    message: error.type === 'entity.parse.failed' ? 'JSON inválido' : error.message
  }));

  if (res.headersSent) {
    return next(error);
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: {
      code: 'INVALID_JSON', message: 'El cuerpo de la petición no contiene JSON válido'
    } });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      error: {
        code: 'INVALID_IDENTIFIER',
        message: 'Identificador inválido'
      }
    });
  }

  if (error.name === 'VersionError') {
    return res.status(409).json({ error: {
      code: 'CONCURRENT_UPDATE',
      message: 'El registro recibió cambios. Actualizá antes de volver a intentar'
    } });
  }

  if (error.name === 'ValidationError') {
    const details = Object.values(error.errors).map((validationError) => ({
      field: validationError.path,
      message: validationError.message
    }));

    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Los datos enviados no son válidos',
        details
      }
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      error: {
        code: 'DUPLICATE_RESOURCE',
        message: 'Ya existe un registro con esos datos'
      }
    });
  }

  const status = error.statusCode || error.status || 500;
  const message = status >= 500 ? 'Error interno del servidor' : error.message;
  const code = error.code && typeof error.code === 'string'
    ? error.code
    : status >= 500
      ? 'INTERNAL_SERVER_ERROR'
      : 'REQUEST_ERROR';

  const response = {
    error: {
      code,
      message
    }
  };

  if (error.details !== undefined) {
    response.error.details = error.details;
  }

  return res.status(status).json(response);
};


