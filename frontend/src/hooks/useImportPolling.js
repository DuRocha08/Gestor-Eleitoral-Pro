import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api.js';

export function useImportPolling(jobId) {
  const [statusJob, setStatusJob] = useState(null);
  const [erroPolling, setErroPolling] = useState(null);

  const intervalRef = useRef(null);

  useEffect(function () {
    if (!jobId) {
      setStatusJob(null);
      setErroPolling(null);
      return;
    }

    async function consultarStatus() {
      try {
        const resposta = await apiFetch('/voters/import/' + jobId);

        if (!resposta.ok) {
          const dados = await resposta.json();
          setErroPolling(dados.erro || 'Erro ao consultar status da importacao.');
          clearInterval(intervalRef.current);
          return;
        }

        const dados = await resposta.json();
        setErroPolling(null);
        setStatusJob(dados);

        if (dados.status === 'concluido' || dados.status === 'erro') {
          clearInterval(intervalRef.current);
        }
      } catch (err) {
        setErroPolling('Falha de conexao ao consultar importacao. Nova tentativa em instantes.');
      }
    }

    consultarStatus();

    // Atualiza o andamento sem fazer requisições em excesso.
    intervalRef.current = setInterval(consultarStatus, 2000);

    return function () {
      clearInterval(intervalRef.current);
    };
  }, [jobId]);

  return { statusJob, erroPolling };
}
