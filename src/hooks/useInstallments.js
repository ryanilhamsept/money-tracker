import { useState, useEffect, useCallback, useRef } from "react";
import {
    getInstallmentsFromSupabase,
    addInstallmentToSupabase,
    updateInstallmentInSupabase,
    deleteInstallmentFromSupabase,
} from "../services/supabase";

export const useInstallments = (userId) => {
    const [installments, setInstallments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const installmentsRef = useRef([]);

    const replaceInstallments = useCallback((next) => {
        installmentsRef.current = next;
        setInstallments(next);
    }, []);

    const loadInstallments = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await getInstallmentsFromSupabase();
            replaceInstallments(data);
            setError(null);
        } catch (err) {
            console.error("FAILED TO LOAD INSTALLMENTS:", err);
            setError("Gagal memuat data cicilan.");
        } finally {
            setIsLoading(false);
        }
    }, [replaceInstallments]);

    useEffect(() => {
        if (userId) {
            loadInstallments();
        } else {
            replaceInstallments([]);
            setIsLoading(false);
        }
    }, [userId, loadInstallments, replaceInstallments]);

    const addInstallment = async (installment) => {
        const newInstallment = {
            id: `inst-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            accountId: installment.accountId,
            transactionId: installment.transactionId || null,
            name: installment.name,
            provider: installment.provider || "",
            totalLoan: Number(installment.totalLoan) || 0,
            remainingBalance: Number(installment.remainingBalance) || 0,
            monthlyInstallment: Number(installment.monthlyInstallment) || 0,
            remainingTerm: installment.remainingTerm || null,
            dueDate: installment.dueDate || null,
        };

        replaceInstallments([newInstallment, ...installmentsRef.current]);

        try {
            await addInstallmentToSupabase(newInstallment);
            setError(null);
            return true;
        } catch (err) {
            console.error("Error saving installment:", err);
            replaceInstallments(
                installmentsRef.current.filter((i) => i.id !== newInstallment.id)
            );
            setError("Gagal menyimpan cicilan.");
            return false;
        }
    };

    const updateInstallment = async (id, fields) => {
        const original = installmentsRef.current.find((i) => i.id === id);
        if (!original) return false;

        replaceInstallments(
            installmentsRef.current.map((i) => (i.id === id ? { ...i, ...fields } : i))
        );

        try {
            await updateInstallmentInSupabase(id, fields);
            setError(null);
            return true;
        } catch (err) {
            console.error("Error updating installment:", err);
            replaceInstallments(
                installmentsRef.current.map((i) => (i.id === id ? original : i))
            );
            setError("Gagal menyimpan perubahan cicilan.");
            return false;
        }
    };

    const deleteInstallment = async (id) => {
        const deleted = installmentsRef.current.find((i) => i.id === id);
        if (!deleted) return false;

        replaceInstallments(installmentsRef.current.filter((i) => i.id !== id));

        try {
            await deleteInstallmentFromSupabase(id);
            setError(null);
            return true;
        } catch (err) {
            console.error("Error deleting installment:", err);
            replaceInstallments([deleted, ...installmentsRef.current]);
            setError("Gagal menghapus cicilan.");
            return false;
        }
    };

    return {
        installments,
        isLoading,
        error,
        addInstallment,
        updateInstallment,
        deleteInstallment,
        reloadInstallments: loadInstallments,
    };
};
